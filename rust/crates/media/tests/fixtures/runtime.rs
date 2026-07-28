use std::{
    env, fs,
    io::{self, Write},
    path::PathBuf,
    thread,
    time::Duration,
};

fn main() {
    let executable = env::current_exe().expect("fixture executable");
    let name = executable
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().is_some_and(|value| value == "-version") {
        if name.contains("ffprobe") {
            println!("ffprobe version 8.0-limeshot-test");
        } else {
            println!("ffmpeg version 8.0-limeshot-test");
        }
        return;
    }
    if name.contains("ffprobe") {
        println!(
            r#"{{"streams":[{{"index":0,"codec_type":"audio","codec_name":"aac","sample_rate":"48000","channels":2}}],"format":{{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"1.000","size":"64"}}}}"#
        );
        return;
    }

    let output = arguments
        .last()
        .map(PathBuf::from)
        .expect("ffmpeg output path");
    fs::write(&output, b"limeshot-media-output").expect("write partial output");
    println!("out_time_us=500000");
    io::stdout().flush().expect("flush progress");
    if name.contains("success") {
        println!("out_time_us=1000000");
        println!("progress=end");
        return;
    }
    fs::write(
        executable.with_file_name("active-media-pid.txt"),
        std::process::id().to_string(),
    )
    .expect("write fixture pid");
    loop {
        thread::sleep(Duration::from_millis(50));
    }
}
