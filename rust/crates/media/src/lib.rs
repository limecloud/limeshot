use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use business_protocol::{
    MediaProbeSummary, MediaStreamSummary, ResourceState, ServiceDescriptor, ServiceListResult,
};
use serde::Deserialize;

mod process;

use process::{run_ffmpeg, run_with_timeout, sanitized_stderr};

const CATALOG_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/services/catalog.v1.json"
));
const PROCESS_TIMEOUT: Duration = Duration::from_secs(30);
const TRANSCODE_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_OUTPUT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceCatalog {
    catalog_version: u32,
    services: Vec<ServiceDescriptor>,
}

#[derive(Debug, Clone)]
pub struct MediaService {
    ffprobe: Option<PathBuf>,
    ffmpeg: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaError {
    code: &'static str,
    message: String,
}

impl MediaError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl std::fmt::Display for MediaError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for MediaError {}

impl MediaService {
    pub fn unavailable() -> Self {
        Self {
            ffprobe: None,
            ffmpeg: None,
        }
    }

    pub fn with_ffprobe(path: PathBuf) -> Result<Self, MediaError> {
        Self::with_executables(Some(path), None)
    }

    pub fn with_executables(
        ffprobe: Option<PathBuf>,
        ffmpeg: Option<PathBuf>,
    ) -> Result<Self, MediaError> {
        let ffprobe = ffprobe
            .map(|path| validate_executable(path, "ffprobe"))
            .transpose()?;
        let ffmpeg = ffmpeg
            .map(|path| validate_executable(path, "ffmpeg"))
            .transpose()?;
        Ok(Self { ffprobe, ffmpeg })
    }

    pub fn transcode_ready(&self) -> bool {
        self.ffprobe.is_some() && self.ffmpeg.is_some()
    }

    pub fn ensure_transcode_ready(&self) -> Result<(), MediaError> {
        if self.transcode_ready() {
            Ok(())
        } else {
            Err(MediaError::new(
                "MEDIA_RUNTIME_UNAVAILABLE",
                "FFprobe/FFmpeg 受管资源尚未准备，媒体输出已阻止",
            ))
        }
    }

    pub fn list_services(&self) -> ServiceListResult {
        let mut catalog: ServiceCatalog =
            serde_json::from_str(CATALOG_SOURCE).expect("service catalog must be valid JSON");
        for service in &mut catalog.services {
            let ready = match service.service_id.as_str() {
                "media.probe" => self.ffprobe.is_some(),
                "media.assemble" => self.transcode_ready(),
                _ => false,
            };
            if ready {
                service.state = ResourceState::Ready;
                service.reason_key = "catalog.ready".to_owned();
            }
        }
        ServiceListResult {
            catalog_version: catalog.catalog_version,
            services: catalog.services,
        }
    }

    pub fn probe(&self, input: &Path) -> Result<MediaProbeSummary, MediaError> {
        let ffprobe = self.ffprobe.as_ref().ok_or_else(|| {
            MediaError::new(
                "MEDIA_RUNTIME_UNAVAILABLE",
                "FFprobe 受管资源尚未准备，媒体探测已阻止",
            )
        })?;
        probe_with(ffprobe, input)
    }

    pub fn transcode(
        &self,
        input: &Path,
        partial: &Path,
        output: &Path,
        canceled: &AtomicBool,
        progress: impl FnMut(u8),
    ) -> Result<MediaProbeSummary, MediaError> {
        self.transcode_with_timeout(
            input,
            partial,
            output,
            canceled,
            TRANSCODE_TIMEOUT,
            progress,
        )
    }

    fn transcode_with_timeout(
        &self,
        input: &Path,
        partial: &Path,
        output: &Path,
        canceled: &AtomicBool,
        timeout: Duration,
        mut progress: impl FnMut(u8),
    ) -> Result<MediaProbeSummary, MediaError> {
        self.ensure_transcode_ready()?;
        let ffmpeg = self.ffmpeg.as_ref().expect("checked FFmpeg runtime");
        if !input.is_absolute() || !input.is_file() {
            return Err(MediaError::new("MEDIA_INPUT_MISSING", "待处理素材不存在"));
        }
        if !partial.is_absolute() || !output.is_absolute() || partial == output {
            return Err(MediaError::new(
                "MEDIA_OUTPUT_INVALID",
                "媒体输出路径必须是不同的绝对路径",
            ));
        }
        if output.exists() {
            return Err(MediaError::new(
                "MEDIA_OUTPUT_CONFLICT",
                "媒体输出文件已存在",
            ));
        }
        let parent = partial
            .parent()
            .ok_or_else(|| MediaError::new("MEDIA_OUTPUT_INVALID", "媒体输出目录无效"))?;
        fs::create_dir_all(parent)
            .map_err(|error| MediaError::new("MEDIA_OUTPUT_CREATE_FAILED", error.to_string()))?;
        if partial.exists() {
            fs::remove_file(partial).map_err(|error| {
                MediaError::new("MEDIA_OUTPUT_CLEANUP_FAILED", error.to_string())
            })?;
        }

        let source = self.probe(input)?;
        progress(5);
        let result = run_ffmpeg(
            ffmpeg,
            input,
            partial,
            source.duration_ms,
            canceled,
            timeout,
            &mut progress,
        );
        if let Err(error) = result {
            let _ = fs::remove_file(partial);
            return Err(error);
        }
        let metadata = fs::metadata(partial).map_err(|error| {
            let _ = fs::remove_file(partial);
            MediaError::new("MEDIA_OUTPUT_MISSING", error.to_string())
        })?;
        if !metadata.is_file() || metadata.len() == 0 {
            let _ = fs::remove_file(partial);
            return Err(MediaError::new(
                "MEDIA_OUTPUT_INVALID",
                "FFmpeg 未生成有效媒体文件",
            ));
        }
        if canceled.load(Ordering::Acquire) {
            let _ = fs::remove_file(partial);
            return Err(MediaError::new("MEDIA_TASK_CANCELED", "媒体任务已取消"));
        }
        fs::rename(partial, output).map_err(|error| {
            let _ = fs::remove_file(partial);
            MediaError::new("MEDIA_OUTPUT_COMMIT_FAILED", error.to_string())
        })?;
        let media = match self.probe(output) {
            Ok(media) => media,
            Err(error) => {
                let _ = fs::remove_file(output);
                return Err(error);
            }
        };
        progress(95);
        Ok(media)
    }
}

fn validate_executable(path: PathBuf, name: &str) -> Result<PathBuf, MediaError> {
    if !path.is_absolute() || !path.is_file() {
        return Err(MediaError::new(
            "MEDIA_RUNTIME_INVALID",
            format!("{name} 必须是存在的绝对可执行文件"),
        ));
    }
    let output = run_with_timeout(
        &path,
        &["-version"],
        Duration::from_secs(5),
        MAX_OUTPUT_BYTES,
    )?;
    let version = String::from_utf8_lossy(&output.stdout);
    if !output.status.success()
        || !version
            .to_ascii_lowercase()
            .contains(&format!("{name} version"))
    {
        return Err(MediaError::new(
            "MEDIA_RUNTIME_INVALID",
            format!("受管 {name} 版本校验失败"),
        ));
    }
    Ok(path)
}

fn probe_with(ffprobe: &Path, input: &Path) -> Result<MediaProbeSummary, MediaError> {
    if !input.is_absolute() || !input.is_file() {
        return Err(MediaError::new("MEDIA_INPUT_MISSING", "待探测素材不存在"));
    }
    let input_text = input
        .to_str()
        .ok_or_else(|| MediaError::new("MEDIA_INPUT_INVALID", "素材路径不是有效的 UTF-8 路径"))?;
    let output = run_with_timeout(
        ffprobe,
        &[
            "-v",
            "error",
            "-show_entries",
            "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
            "-of",
            "json",
            input_text,
        ],
        PROCESS_TIMEOUT,
        MAX_OUTPUT_BYTES,
    )?;
    if !output.status.success() {
        return Err(MediaError::new(
            "MEDIA_PROBE_FAILED",
            sanitized_stderr(&output.stderr, input),
        ));
    }
    parse_probe(&output.stdout, input)
}

#[derive(Debug, Deserialize)]
struct ProbeOutput {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    #[serde(default)]
    format: ProbeFormat,
}

#[derive(Debug, Default, Deserialize)]
struct ProbeFormat {
    #[serde(default)]
    format_name: String,
    duration: Option<String>,
    size: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProbeStream {
    index: u32,
    #[serde(default)]
    codec_type: String,
    #[serde(default)]
    codec_name: String,
    width: Option<u32>,
    height: Option<u32>,
    sample_rate: Option<String>,
    channels: Option<u32>,
}

fn parse_probe(bytes: &[u8], input: &Path) -> Result<MediaProbeSummary, MediaError> {
    let output: ProbeOutput = serde_json::from_slice(bytes).map_err(|error| {
        MediaError::new(
            "MEDIA_PROBE_OUTPUT_INVALID",
            format!("FFprobe 输出无法解析: {error}"),
        )
    })?;
    if output.streams.is_empty() || output.format.format_name.trim().is_empty() {
        return Err(MediaError::new(
            "MEDIA_PROBE_OUTPUT_INVALID",
            "FFprobe 未返回可用的媒体流",
        ));
    }
    let duration_ms = output
        .format
        .duration
        .as_deref()
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| (value * 1000.0).round() as u64)
        .unwrap_or_default();
    let byte_size = output
        .format
        .size
        .as_deref()
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| input.metadata().ok().map(|metadata| metadata.len()))
        .unwrap_or_default();
    let streams = output
        .streams
        .into_iter()
        .map(|stream| MediaStreamSummary {
            index: stream.index,
            kind: stream.codec_type,
            codec: stream.codec_name,
            width: stream.width,
            height: stream.height,
            sample_rate: stream
                .sample_rate
                .as_deref()
                .and_then(|value| value.parse::<u32>().ok()),
            channels: stream.channels,
        })
        .collect();
    Ok(MediaProbeSummary {
        duration_ms,
        container: output.format.format_name,
        byte_size,
        streams,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::Cursor,
        process::Command,
        sync::Arc,
        thread,
        time::{Instant, SystemTime, UNIX_EPOCH},
    };

    use super::process::{join_reader, read_bounded};
    use super::*;

    #[test]
    fn reports_missing_managed_media_runtime_without_path_fallback() {
        let service = MediaService::unavailable();
        let catalog = service.list_services();
        assert_eq!(catalog.catalog_version, 1);
        assert!(catalog.services.iter().any(|candidate| {
            candidate.service_id == "media.probe" && candidate.state == ResourceState::Blocked
        }));
        assert_eq!(
            service
                .probe(Path::new("/missing"))
                .expect_err("blocked")
                .code(),
            "MEDIA_RUNTIME_UNAVAILABLE"
        );
    }

    #[test]
    fn parses_structured_probe_output() {
        let root = std::env::temp_dir().join(format!(
            "limeshot-media-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("fixture root");
        let input = root.join("clip.wav");
        fs::write(&input, [0_u8; 32]).expect("fixture");
        let result = parse_probe(
            br#"{"streams":[{"index":0,"codec_type":"audio","codec_name":"pcm_s16le","sample_rate":"48000","channels":2}],"format":{"format_name":"wav","duration":"1.250","size":"32"}}"#,
            &input,
        )
        .expect("probe result");
        assert_eq!(result.duration_ms, 1_250);
        assert_eq!(result.streams[0].sample_rate, Some(48_000));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn bounds_captured_output_without_unbounded_allocation() {
        let exceeded = Arc::new(AtomicBool::new(false));
        let reader = read_bounded(
            Cursor::new(vec![7_u8; 128 * 1024]),
            16 * 1024,
            Arc::clone(&exceeded),
        );
        let output = join_reader(reader).expect("bounded output");
        assert_eq!(output.bytes.len(), 16 * 1024);
        assert!(output.exceeded);
        assert!(exceeded.load(Ordering::Acquire));
    }

    #[cfg(unix)]
    #[test]
    fn drains_large_process_output_while_waiting() {
        let script = "i=0; while [ \"$i\" -lt 20000 ]; do printf '0123456789012345678901234567890123456789012345678901234567890123'; i=$((i+1)); done";
        let started = Instant::now();
        let error = run_with_timeout(
            Path::new("/bin/sh"),
            &["-c", script],
            Duration::from_secs(3),
            16 * 1024,
        )
        .expect_err("output must be bounded");
        assert_eq!(error.code(), "MEDIA_RUNTIME_OUTPUT_LIMIT");
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn transcodes_to_an_atomic_output_with_structured_progress() {
        let root = fixture_root();
        let service = fixture_service(&root, "success");
        let input = root.join("source.wav");
        let partial = root.join(".output.mp4.part");
        let output = root.join("output.mp4");
        fs::write(&input, b"source").expect("source fixture");
        let canceled = AtomicBool::new(false);
        let mut progress = Vec::new();
        let media = service
            .transcode_with_timeout(
                &input,
                &partial,
                &output,
                &canceled,
                Duration::from_secs(3),
                |value| progress.push(value),
            )
            .expect("transcode");
        assert!(output.is_file());
        assert!(!partial.exists());
        assert_eq!(media.duration_ms, 1_000);
        assert!(progress.contains(&5));
        assert!(progress.iter().any(|value| *value >= 50));
        assert_eq!(progress.last(), Some(&95));
        assert!(service.transcode_ready());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn timeout_reaps_the_process_and_removes_partial_output() {
        let root = fixture_root();
        let service = fixture_service(&root, "timeout");
        let input = root.join("source.wav");
        let partial = root.join(".output.mp4.part");
        let output = root.join("output.mp4");
        fs::write(&input, b"source").expect("source fixture");
        let error = service
            .transcode_with_timeout(
                &input,
                &partial,
                &output,
                &AtomicBool::new(false),
                Duration::from_millis(150),
                |_| {},
            )
            .expect_err("timeout");
        assert_eq!(error.code(), "MEDIA_RUNTIME_TIMEOUT");
        assert!(!partial.exists());
        assert!(!output.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_reaps_the_process_and_removes_partial_output() {
        let root = fixture_root();
        let service = fixture_service(&root, "cancel");
        let input = root.join("source.wav");
        let partial = root.join(".output.mp4.part");
        let output = root.join("output.mp4");
        fs::write(&input, b"source").expect("source fixture");
        let canceled = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&canceled);
        let worker_input = input.clone();
        let worker_partial = partial.clone();
        let worker_output = output.clone();
        let worker = thread::spawn(move || {
            service.transcode_with_timeout(
                &worker_input,
                &worker_partial,
                &worker_output,
                &worker_cancel,
                Duration::from_secs(3),
                |_| {},
            )
        });
        let started = Instant::now();
        while !partial.exists() && started.elapsed() < Duration::from_secs(2) {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(partial.exists(), "fixture process did not start");
        canceled.store(true, Ordering::Release);
        let error = worker.join().expect("worker").expect_err("canceled");
        assert_eq!(error.code(), "MEDIA_TASK_CANCELED");
        assert!(!partial.exists());
        assert!(!output.exists());
        let _ = fs::remove_dir_all(root);
    }

    fn fixture_root() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "limeshot-media-runtime-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("fixture root");
        root
    }

    fn fixture_service(root: &Path, mode: &str) -> MediaService {
        let ffprobe = compile_fixture(root, "ffprobe");
        let ffmpeg = compile_fixture(root, &format!("ffmpeg-{mode}"));
        MediaService::with_executables(Some(ffprobe), Some(ffmpeg)).expect("fixture service")
    }

    fn compile_fixture(root: &Path, name: &str) -> PathBuf {
        let executable = root.join(if cfg!(windows) {
            format!("{name}.exe")
        } else {
            name.to_owned()
        });
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/runtime.rs");
        let output = Command::new("rustc")
            .arg(source)
            .args(["-O", "-o"])
            .arg(&executable)
            .output()
            .expect("run rustc");
        assert!(
            output.status.success(),
            "fixture compilation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        executable
    }
}
