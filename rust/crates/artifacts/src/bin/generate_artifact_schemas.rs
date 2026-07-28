use std::{env, path::PathBuf};

fn main() {
    let root = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    artifacts::write_schemas(&root).expect("generate artifact schemas");
}
