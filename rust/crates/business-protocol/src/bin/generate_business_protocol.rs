use std::{env, fs, path::PathBuf};

use business_protocol::{protocol_schema_bundle, typescript_bindings};

fn main() {
    let root = env::args().nth(1).unwrap_or_else(|| ".".to_owned());
    let root = PathBuf::from(root);
    let schema_path = root.join("schemas/business/protocol.json");
    let types_path = root.join("packages/business-client/src/generated.ts");
    fs::create_dir_all(schema_path.parent().expect("schema parent"))
        .expect("create schema directory");
    fs::create_dir_all(types_path.parent().expect("types parent")).expect("create types directory");
    let schema = serde_json::to_string_pretty(&protocol_schema_bundle()).expect("serialize schema");
    fs::write(schema_path, format!("{schema}\n")).expect("write schema");
    fs::write(types_path, typescript_bindings()).expect("write TypeScript bindings");
}
