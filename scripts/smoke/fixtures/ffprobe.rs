use std::{
    env,
    fs::OpenOptions,
    io::Write,
};

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().is_some_and(|value| value == "-version") {
        println!("ffprobe version 8.0-limeshot-gate-b");
        return;
    }

    let executable = env::current_exe().expect("fixture executable path");
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(executable.with_file_name("ffprobe-argv.txt"))
        .expect("open fixture argv log");
    writeln!(log, "{}", arguments.join("\n")).expect("write fixture argv");
    let input = arguments.last().map(String::as_str).unwrap_or_default();
    if input.ends_with(".mp4") {
        println!(
            r#"{{"streams":[{{"index":0,"codec_type":"audio","codec_name":"aac","sample_rate":"48000","channels":2}}],"format":{{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"1.000","size":"19"}}}}"#
        );
    } else {
        println!(
            r#"{{"streams":[{{"index":0,"codec_type":"audio","codec_name":"pcm_s16le","sample_rate":"8000","channels":1}}],"format":{{"format_name":"wav","duration":"0.100","size":"1644"}}}}"#
        );
    }
}
