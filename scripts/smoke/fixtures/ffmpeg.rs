use std::{
    env, fs,
    io::{self, Write},
    thread,
    time::Duration,
};

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().is_some_and(|value| value == "-version") {
        println!("ffmpeg version 8.0-limeshot-gate-b");
        return;
    }

    let executable = env::current_exe().expect("fixture executable path");
    fs::write(
        executable.with_file_name("ffmpeg-argv.txt"),
        arguments.join("\n"),
    )
    .expect("write fixture argv");
    let count_path = executable.with_file_name("ffmpeg-run-count.txt");
    let count = fs::read_to_string(&count_path)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or_default()
        + 1;
    fs::write(&count_path, count.to_string()).expect("write run count");
    let output = arguments.last().expect("output path");
    fs::write(output, b"limeshot-gate-b-mp4").expect("write partial output");
    println!("out_time_us=500000");
    io::stdout().flush().expect("flush progress");
    if count != 2 {
        thread::sleep(Duration::from_millis(120));
        println!("out_time_us=1000000");
        println!("progress=end");
        return;
    }

    fs::write(
        executable.with_file_name("ffmpeg-active-pid.txt"),
        std::process::id().to_string(),
    )
    .expect("write active pid");
    loop {
        thread::sleep(Duration::from_millis(50));
    }
}
