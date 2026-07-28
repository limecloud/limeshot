use std::{
    io::{self, BufRead, BufReader, Read},
    path::Path,
    process::{Command, Output, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};

use super::{MAX_OUTPUT_BYTES, MediaError};

pub(super) fn run_ffmpeg(
    executable: &Path,
    input: &Path,
    partial: &Path,
    duration_ms: u64,
    canceled: &AtomicBool,
    timeout: Duration,
    progress: &mut impl FnMut(u8),
) -> Result<(), MediaError> {
    let mut command = Command::new(executable);
    command
        .args([
            "-hide_banner",
            "-nostdin",
            "-v",
            "error",
            "-progress",
            "pipe:1",
            "-nostats",
            "-n",
            "-i",
        ])
        .arg(input)
        .args([
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c:v",
            "mpeg4",
            "-q:v",
            "5",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
        ])
        .arg(partial)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_minimal_environment(&mut command);
    let mut child = command.spawn().map_err(|error| {
        MediaError::new(
            "MEDIA_RUNTIME_START_FAILED",
            format!("FFmpeg 进程无法启动 ({:?})", error.kind()),
        )
    })?;
    let stdout = child.stdout.take().expect("piped stdout must be available");
    let stderr = child.stderr.take().expect("piped stderr must be available");
    let exceeded = Arc::new(AtomicBool::new(false));
    let (progress_tx, progress_rx) = mpsc::sync_channel(32);
    let progress_reader = read_progress(
        stdout,
        duration_ms,
        MAX_OUTPUT_BYTES,
        Arc::clone(&exceeded),
        progress_tx,
    );
    let stderr_reader = read_bounded(stderr, MAX_OUTPUT_BYTES, Arc::clone(&exceeded));
    let started = Instant::now();
    let status = loop {
        drain_progress(&progress_rx, progress);
        if canceled.load(Ordering::Acquire) {
            terminate_and_wait(&mut child);
            drain_ffmpeg_readers(progress_reader, stderr_reader);
            return Err(MediaError::new("MEDIA_TASK_CANCELED", "媒体任务已取消"));
        }
        if exceeded.load(Ordering::Acquire) {
            terminate_and_wait(&mut child);
            drain_ffmpeg_readers(progress_reader, stderr_reader);
            return Err(MediaError::new(
                "MEDIA_RUNTIME_OUTPUT_LIMIT",
                "FFmpeg 输出超过限制并已终止",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                terminate_and_wait(&mut child);
                drain_ffmpeg_readers(progress_reader, stderr_reader);
                return Err(MediaError::new(
                    "MEDIA_RUNTIME_TIMEOUT",
                    "FFmpeg 执行超时并已终止",
                ));
            }
            Err(error) => {
                terminate_and_wait(&mut child);
                drain_ffmpeg_readers(progress_reader, stderr_reader);
                return Err(MediaError::new(
                    "MEDIA_RUNTIME_WAIT_FAILED",
                    error.to_string(),
                ));
            }
        }
    };
    let progress_output = join_progress_reader(progress_reader)?;
    let stderr = join_reader(stderr_reader)?;
    drain_progress(&progress_rx, progress);
    if progress_output.exceeded || stderr.exceeded {
        return Err(MediaError::new(
            "MEDIA_RUNTIME_OUTPUT_LIMIT",
            "FFmpeg 输出超过限制",
        ));
    }
    if !status.success() {
        return Err(MediaError::new(
            "MEDIA_TRANSCODE_FAILED",
            sanitized_stderr(&stderr.bytes, input),
        ));
    }
    Ok(())
}

#[derive(Debug)]
struct ProgressOutput {
    exceeded: bool,
}

fn read_progress<R>(
    reader: R,
    duration_ms: u64,
    limit: usize,
    process_exceeded: Arc<AtomicBool>,
    progress: SyncSender<u8>,
) -> thread::JoinHandle<io::Result<ProgressOutput>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = Vec::with_capacity(128);
        let mut total = 0_usize;
        let mut exceeded = false;
        loop {
            line.clear();
            let read = reader.read_until(b'\n', &mut line)?;
            if read == 0 {
                break;
            }
            total = total.saturating_add(read);
            if total > limit || line.len() > 16 * 1024 {
                exceeded = true;
                process_exceeded.store(true, Ordering::Release);
                continue;
            }
            if let Some(value) = parse_progress(&line, duration_ms) {
                let _ = progress.try_send(value);
            }
        }
        Ok(ProgressOutput { exceeded })
    })
}

fn parse_progress(line: &[u8], duration_ms: u64) -> Option<u8> {
    let text = std::str::from_utf8(line).ok()?.trim();
    if text == "progress=end" {
        return Some(94);
    }
    let out_time_us = text.strip_prefix("out_time_us=")?.parse::<u64>().ok()?;
    if duration_ms == 0 {
        return None;
    }
    let elapsed_ms = out_time_us / 1_000;
    Some((10 + elapsed_ms.saturating_mul(84) / duration_ms).min(94) as u8)
}

fn drain_progress(receiver: &Receiver<u8>, progress: &mut impl FnMut(u8)) {
    while let Ok(value) = receiver.try_recv() {
        progress(value);
    }
}

fn join_progress_reader(
    reader: thread::JoinHandle<io::Result<ProgressOutput>>,
) -> Result<ProgressOutput, MediaError> {
    reader
        .join()
        .map_err(|_| MediaError::new("MEDIA_RUNTIME_READ_FAILED", "FFmpeg 进度读取线程异常"))?
        .map_err(|error| MediaError::new("MEDIA_RUNTIME_READ_FAILED", error.to_string()))
}

fn drain_ffmpeg_readers(
    progress: thread::JoinHandle<io::Result<ProgressOutput>>,
    stderr: thread::JoinHandle<io::Result<BoundedOutput>>,
) {
    let _ = progress.join();
    let _ = stderr.join();
}

pub(super) fn run_with_timeout(
    executable: &Path,
    args: &[&str],
    timeout: Duration,
    output_limit: usize,
) -> Result<Output, MediaError> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_minimal_environment(&mut command);
    let mut child = command.spawn().map_err(|error| {
        MediaError::new(
            "MEDIA_RUNTIME_START_FAILED",
            format!("媒体进程无法启动 ({:?})", error.kind()),
        )
    })?;
    let stdout = child.stdout.take().expect("piped stdout must be available");
    let stderr = child.stderr.take().expect("piped stderr must be available");
    let exceeded = Arc::new(AtomicBool::new(false));
    let stdout_reader = read_bounded(stdout, output_limit, Arc::clone(&exceeded));
    let stderr_reader = read_bounded(stderr, output_limit, Arc::clone(&exceeded));
    let started = Instant::now();
    let status = loop {
        if exceeded.load(Ordering::Acquire) {
            terminate_and_wait(&mut child);
            drain_readers(stdout_reader, stderr_reader);
            return Err(MediaError::new(
                "MEDIA_RUNTIME_OUTPUT_LIMIT",
                "媒体进程输出超过限制并已终止",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                terminate_and_wait(&mut child);
                drain_readers(stdout_reader, stderr_reader);
                return Err(MediaError::new(
                    "MEDIA_RUNTIME_TIMEOUT",
                    "媒体进程执行超时并已终止",
                ));
            }
            Err(error) => {
                terminate_and_wait(&mut child);
                drain_readers(stdout_reader, stderr_reader);
                return Err(MediaError::new(
                    "MEDIA_RUNTIME_WAIT_FAILED",
                    error.to_string(),
                ));
            }
        }
    };
    let stdout = join_reader(stdout_reader)?;
    let stderr = join_reader(stderr_reader)?;
    if stdout.exceeded || stderr.exceeded {
        return Err(MediaError::new(
            "MEDIA_RUNTIME_OUTPUT_LIMIT",
            "媒体进程输出超过限制",
        ));
    }
    Ok(Output {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
    })
}

fn apply_minimal_environment(command: &mut Command) {
    for key in ["TMPDIR", "TMP", "TEMP", "SystemRoot", "WINDIR"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
}

#[derive(Debug)]
pub(super) struct BoundedOutput {
    pub(super) bytes: Vec<u8>,
    pub(super) exceeded: bool,
}

pub(super) fn read_bounded<R>(
    mut reader: R,
    limit: usize,
    process_exceeded: Arc<AtomicBool>,
) -> thread::JoinHandle<io::Result<BoundedOutput>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
        let mut buffer = [0_u8; 16 * 1024];
        let mut exceeded = false;
        loop {
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            let retained = read.min(limit.saturating_sub(bytes.len()));
            bytes.extend_from_slice(&buffer[..retained]);
            if retained != read {
                exceeded = true;
                process_exceeded.store(true, Ordering::Release);
            }
        }
        Ok(BoundedOutput { bytes, exceeded })
    })
}

pub(super) fn join_reader(
    reader: thread::JoinHandle<io::Result<BoundedOutput>>,
) -> Result<BoundedOutput, MediaError> {
    reader
        .join()
        .map_err(|_| MediaError::new("MEDIA_RUNTIME_READ_FAILED", "媒体进程输出读取线程异常"))?
        .map_err(|error| MediaError::new("MEDIA_RUNTIME_READ_FAILED", error.to_string()))
}

fn drain_readers(
    stdout: thread::JoinHandle<io::Result<BoundedOutput>>,
    stderr: thread::JoinHandle<io::Result<BoundedOutput>>,
) {
    let _ = stdout.join();
    let _ = stderr.join();
}

fn terminate_and_wait(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

pub(super) fn sanitized_stderr(bytes: &[u8], input: &Path) -> String {
    let text = String::from_utf8_lossy(bytes);
    let summary = text.lines().next().unwrap_or("媒体进程执行失败").trim();
    summary
        .replace(&*input.to_string_lossy(), "<source>")
        .chars()
        .take(240)
        .collect()
}
