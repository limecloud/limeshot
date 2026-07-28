use std::{collections::BTreeMap, fs, path::Path};

use business_protocol::{
    ArtifactContractDescriptor, ArtifactContractListResult, MediaProbeSummary, QaCheckSummary,
    QaReportSummary,
};
use schemars::{JsonSchema, schema_for};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

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
    pub byte_size: u64,
    pub streams: Vec<MediaStreamContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaOutputContent {
    pub duration_ms: u64,
    pub container: String,
    pub byte_size: u64,
    pub streams: Vec<MediaStreamContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaStreamContent {
    pub index: u32,
    pub kind: String,
    pub codec: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
}

pub fn media_manifest_document(
    project_id: &str,
    source_asset_id: &str,
    created_at_epoch_ms: i64,
    media: &MediaProbeSummary,
) -> Result<Vec<u8>, serde_json::Error> {
    let content = MediaManifestContent {
        media_refs: vec![source_asset_id.to_owned()],
        duration_ms: media.duration_ms,
        container: media.container.clone(),
        byte_size: media.byte_size,
        streams: media
            .streams
            .iter()
            .map(|stream| MediaStreamContent {
                index: stream.index,
                kind: stream.kind.clone(),
                codec: stream.codec.clone(),
                width: stream.width,
                height: stream.height,
                sample_rate: stream.sample_rate,
                channels: stream.channels,
            })
            .collect(),
    };
    let content_bytes = serde_json::to_vec(&content)?;
    let created_at =
        OffsetDateTime::from_unix_timestamp_nanos(i128::from(created_at_epoch_ms) * 1_000_000)
            .ok()
            .and_then(|value| value.format(&Rfc3339).ok())
            .unwrap_or_else(|| created_at_epoch_ms.to_string());
    serde_json::to_vec_pretty(&ArtifactEnvelope {
        schema_version: 1,
        artifact_type: "media-manifest.v1".to_owned(),
        project_id: project_id.to_owned(),
        producer: "media.probe".to_owned(),
        source_refs: vec![source_asset_id.to_owned()],
        content_hash: hex::encode(Sha256::digest(&content_bytes)),
        created_at,
        content,
    })
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

pub fn evaluate_media_output(media: &MediaProbeSummary) -> QaReportSummary {
    let formats = media
        .container
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    let checks = vec![
        QaCheckSummary {
            check_id: "container.mp4".to_owned(),
            passed: formats.contains(&"mp4"),
            detail: format!("container={}", media.container),
        },
        QaCheckSummary {
            check_id: "duration.positive".to_owned(),
            passed: media.duration_ms > 0,
            detail: format!("durationMs={}", media.duration_ms),
        },
        QaCheckSummary {
            check_id: "file.non_empty".to_owned(),
            passed: media.byte_size > 0,
            detail: format!("byteSize={}", media.byte_size),
        },
        QaCheckSummary {
            check_id: "stream.playable".to_owned(),
            passed: media.streams.iter().any(|stream| {
                matches!(stream.kind.as_str(), "audio" | "video") && !stream.codec.trim().is_empty()
            }),
            detail: format!("streamCount={}", media.streams.len()),
        },
    ];
    QaReportSummary {
        passed: checks.iter().all(|check| check.passed),
        checks,
    }
}

pub fn qa_report_document(
    project_id: &str,
    source_ref: &str,
    created_at_epoch_ms: i64,
    qa: &QaReportSummary,
) -> Result<Vec<u8>, serde_json::Error> {
    let content = QaReportContent {
        passed: qa.passed,
        checks: qa
            .checks
            .iter()
            .map(|check| QaCheck {
                check_id: check.check_id.clone(),
                passed: check.passed,
                detail: check.detail.clone(),
            })
            .collect(),
    };
    let content_bytes = serde_json::to_vec(&content)?;
    let created_at =
        OffsetDateTime::from_unix_timestamp_nanos(i128::from(created_at_epoch_ms) * 1_000_000)
            .ok()
            .and_then(|value| value.format(&Rfc3339).ok())
            .unwrap_or_else(|| created_at_epoch_ms.to_string());
    serde_json::to_vec_pretty(&ArtifactEnvelope {
        schema_version: 1,
        artifact_type: "qa-report.v1".to_owned(),
        project_id: project_id.to_owned(),
        producer: "media.qa".to_owned(),
        source_refs: vec![source_ref.to_owned()],
        content_hash: hex::encode(Sha256::digest(&content_bytes)),
        created_at,
        content,
    })
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
            "media-output.v1",
            schema_for!(ArtifactEnvelope<MediaOutputContent>),
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
        assert_eq!(contracts.contracts.len(), 14);
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

    #[test]
    fn media_output_qa_requires_an_mp4_with_playable_content() {
        let valid = MediaProbeSummary {
            duration_ms: 1_000,
            container: "mov,mp4,m4a,3gp,3g2,mj2".to_owned(),
            byte_size: 42,
            streams: vec![business_protocol::MediaStreamSummary {
                index: 0,
                kind: "audio".to_owned(),
                codec: "aac".to_owned(),
                width: None,
                height: None,
                sample_rate: Some(48_000),
                channels: Some(2),
            }],
        };
        assert!(evaluate_media_output(&valid).passed);

        let mut invalid = valid;
        invalid.container = "wav".to_owned();
        assert!(!evaluate_media_output(&invalid).passed);
    }

    #[test]
    fn qa_report_document_uses_the_registered_contract() {
        let qa = QaReportSummary {
            passed: true,
            checks: vec![QaCheckSummary {
                check_id: "container.mp4".to_owned(),
                passed: true,
                detail: "container=mp4".to_owned(),
            }],
        };
        let document = qa_report_document("project-1", "task-1", 1, &qa).expect("document");
        let value: Value = serde_json::from_slice(&document).expect("json");
        assert_eq!(value["artifactType"], "qa-report.v1");
        assert_eq!(value["content"]["passed"], true);
    }
}
