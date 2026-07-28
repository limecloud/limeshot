use std::{collections::BTreeMap, fs, path::Path};

use business_protocol::{ArtifactContractDescriptor, ArtifactContractListResult};
use schemars::{JsonSchema, schema_for};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const CATALOG_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/artifacts/catalog.v1.json"
));

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactCatalog {
    catalog_version: u32,
    contracts: Vec<ArtifactContractDescriptor>,
}

pub fn list_contracts() -> ArtifactContractListResult {
    let catalog: ArtifactCatalog =
        serde_json::from_str(CATALOG_SOURCE).expect("artifact catalog must be valid JSON");
    ArtifactContractListResult {
        catalog_version: catalog.catalog_version,
        contracts: catalog.contracts,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactEnvelope<T> {
    pub schema_version: u32,
    pub artifact_type: String,
    pub project_id: String,
    pub producer: String,
    pub source_refs: Vec<String>,
    pub content_hash: String,
    pub created_at: String,
    pub content: T,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSegment {
    pub segment_id: String,
    pub text: String,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptContent {
    pub language: String,
    pub segments: Vec<ScriptSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShotContent {
    pub shot_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShotListContent {
    pub shots: Vec<ShotContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimelineContent {
    pub duration_ms: u64,
    pub covered_ranges: Vec<TimeRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceShotContent {
    pub source_shot_id: String,
    pub range: TimeRange,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntityRegistryContent {
    pub entities: Vec<EntityRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecord {
    pub entity_id: String,
    pub entity_type: String,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssetRegistryContent {
    pub assets: Vec<AssetRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub asset_id: String,
    pub asset_kind: String,
    pub consent_required: bool,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TargetShotContent {
    pub target_shot_id: String,
    pub source_shot_refs: Vec<String>,
    pub asset_refs: Vec<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DialogueCoverageContent {
    pub source_dialogue_refs: Vec<String>,
    pub target_shot_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GenerationUnitContent {
    pub generation_unit_id: String,
    pub target_shot_refs: Vec<String>,
    pub duration_ms: u64,
    pub capability_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptManifestContent {
    pub generation_unit_refs: Vec<String>,
    pub asset_refs: Vec<String>,
    pub prompt_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleContent {
    pub language: String,
    pub cues: Vec<SubtitleCue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCue {
    pub range: TimeRange,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaManifestContent {
    pub media_refs: Vec<String>,
    pub duration_ms: u64,
    pub container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QaReportContent {
    pub passed: bool,
    pub checks: Vec<QaCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QaCheck {
    pub check_id: String,
    pub passed: bool,
    pub detail: String,
}

pub fn write_schemas(root: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let destination = root.join("schemas/artifacts");
    fs::create_dir_all(&destination)?;

    for (artifact_type, schema) in schema_documents() {
        let mut value = serde_json::to_value(schema)?;
        let object = value.as_object_mut().expect("schemars must emit an object");
        object.insert(
            "$id".to_owned(),
            Value::String(format!(
                "https://limeshot.dev/schemas/artifacts/{artifact_type}.json"
            )),
        );
        object.insert(
            "x-artifact-type".to_owned(),
            Value::String(artifact_type.to_owned()),
        );
        fs::write(
            destination.join(format!("{artifact_type}.json")),
            serde_json::to_string_pretty(&value)?,
        )?;
    }

    fs::write(
        destination.join("catalog.v1.json"),
        serde_json::to_string_pretty(&json!({ "contracts": list_contracts().contracts }))?,
    )?;
    Ok(())
}

fn schema_documents() -> BTreeMap<&'static str, schemars::Schema> {
    BTreeMap::from([
        ("script.v1", schema_for!(ArtifactEnvelope<ScriptContent>)),
        (
            "shot-list.v1",
            schema_for!(ArtifactEnvelope<ShotListContent>),
        ),
        (
            "source-timeline.v1",
            schema_for!(ArtifactEnvelope<TimelineContent>),
        ),
        (
            "source-shot.v1",
            schema_for!(ArtifactEnvelope<SourceShotContent>),
        ),
        (
            "entity-registry.v1",
            schema_for!(ArtifactEnvelope<EntityRegistryContent>),
        ),
        (
            "asset-registry.v1",
            schema_for!(ArtifactEnvelope<AssetRegistryContent>),
        ),
        (
            "target-shot.v1",
            schema_for!(ArtifactEnvelope<TargetShotContent>),
        ),
        (
            "dialogue-coverage.v1",
            schema_for!(ArtifactEnvelope<DialogueCoverageContent>),
        ),
        (
            "generation-unit.v1",
            schema_for!(ArtifactEnvelope<GenerationUnitContent>),
        ),
        (
            "prompt-manifest.v1",
            schema_for!(ArtifactEnvelope<PromptManifestContent>),
        ),
        (
            "subtitle.v1",
            schema_for!(ArtifactEnvelope<SubtitleContent>),
        ),
        (
            "media-manifest.v1",
            schema_for!(ArtifactEnvelope<MediaManifestContent>),
        ),
        (
            "qa-report.v1",
            schema_for!(ArtifactEnvelope<QaReportContent>),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_each_v1_contract() {
        let contracts = list_contracts();
        assert_eq!(contracts.catalog_version, 1);
        assert_eq!(contracts.contracts.len(), 13);
        assert!(
            contracts
                .contracts
                .iter()
                .any(|contract| contract.artifact_type == "qa-report.v1")
        );
    }

    #[test]
    fn schema_set_matches_catalog() {
        assert_eq!(schema_documents().len(), list_contracts().contracts.len());
    }
}
