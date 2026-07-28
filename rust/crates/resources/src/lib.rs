use std::{
    collections::BTreeSet,
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
};

use business_protocol::{
    ManagedResourceDescriptor, ManagedResourceKind, ManagedResourceListResult, ResourceState,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const MANIFEST_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/runtime/manifest.v1.json"
));

#[derive(Debug)]
pub struct ResourceManager {
    root: PathBuf,
    platform_key: String,
    manifest: RuntimeManifest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceManagerError {
    code: &'static str,
    message: String,
}

impl ResourceManagerError {
    fn manifest(message: impl Into<String>) -> Self {
        Self {
            code: "RESOURCE_MANIFEST_INVALID",
            message: message.into(),
        }
    }

    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            code: "RESOURCE_NOT_READY",
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

impl std::fmt::Display for ResourceManagerError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ResourceManagerError {}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    schema_version: u32,
    resources: Vec<ManagedResource>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedResource {
    resource_id: String,
    kind: ManagedResourceKind,
    required: bool,
    license: String,
    notice: String,
    releases: Vec<ResourceRelease>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceRelease {
    platform_key: String,
    version: String,
    source_url: String,
    archive_sha256: String,
    executables: Vec<ExecutableRelease>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutableRelease {
    name: String,
    relative_path: String,
    sha256: String,
}

impl ResourceManager {
    pub fn open(root: &Path) -> Result<Self, ResourceManagerError> {
        Self::from_source(root, current_platform_key(), MANIFEST_SOURCE)
    }

    fn from_source(
        root: &Path,
        platform_key: String,
        source: &str,
    ) -> Result<Self, ResourceManagerError> {
        let manifest: RuntimeManifest = serde_json::from_str(source)
            .map_err(|error| ResourceManagerError::manifest(error.to_string()))?;
        validate_manifest(&manifest)?;
        Ok(Self {
            root: root.to_path_buf(),
            platform_key,
            manifest,
        })
    }

    pub fn list(&self) -> ManagedResourceListResult {
        ManagedResourceListResult {
            manifest_version: self.manifest.schema_version,
            resources: self
                .manifest
                .resources
                .iter()
                .map(|resource| self.describe(resource))
                .collect(),
        }
    }

    pub fn executable(
        &self,
        resource_id: &str,
        name: &str,
    ) -> Result<PathBuf, ResourceManagerError> {
        let resource = self
            .manifest
            .resources
            .iter()
            .find(|resource| resource.resource_id == resource_id)
            .ok_or_else(|| ResourceManagerError::unavailable("受管资源不存在"))?;
        let release = resource
            .releases
            .iter()
            .find(|release| release.platform_key == self.platform_key)
            .ok_or_else(|| ResourceManagerError::unavailable("当前平台没有受管资源版本"))?;
        let executable = release
            .executables
            .iter()
            .find(|executable| executable.name == name)
            .ok_or_else(|| ResourceManagerError::unavailable("受管资源可执行文件不存在"))?;
        let path = self
            .release_root(resource, release)
            .join(&executable.relative_path);
        verify_executable(&path, &executable.sha256)?;
        Ok(path)
    }

    fn describe(&self, resource: &ManagedResource) -> ManagedResourceDescriptor {
        let Some(release) = resource
            .releases
            .iter()
            .find(|release| release.platform_key == self.platform_key)
        else {
            return ManagedResourceDescriptor {
                resource_id: resource.resource_id.clone(),
                kind: resource.kind.clone(),
                required: resource.required,
                platform_key: self.platform_key.clone(),
                version: None,
                state: ResourceState::Blocked,
                detail_code: "release_unavailable".to_owned(),
                executable_names: vec![],
            };
        };

        let release_root = self.release_root(resource, release);
        let executable_names = release
            .executables
            .iter()
            .map(|executable| executable.name.clone())
            .collect();
        let mut state = ResourceState::Ready;
        let mut detail_code = "ready".to_owned();
        for executable in &release.executables {
            let path = release_root.join(&executable.relative_path);
            match verify_executable(&path, &executable.sha256) {
                Ok(()) => {}
                Err(error) if error.code() == "RESOURCE_FILE_MISSING" => {
                    state = ResourceState::Missing;
                    detail_code = "not_installed".to_owned();
                    break;
                }
                Err(_) => {
                    state = ResourceState::Blocked;
                    detail_code = "integrity_failed".to_owned();
                    break;
                }
            }
        }

        ManagedResourceDescriptor {
            resource_id: resource.resource_id.clone(),
            kind: resource.kind.clone(),
            required: resource.required,
            platform_key: self.platform_key.clone(),
            version: Some(release.version.clone()),
            state,
            detail_code,
            executable_names,
        }
    }

    fn release_root(&self, resource: &ManagedResource, release: &ResourceRelease) -> PathBuf {
        self.root.join(&resource.resource_id).join(&release.version)
    }
}

fn validate_manifest(manifest: &RuntimeManifest) -> Result<(), ResourceManagerError> {
    if manifest.schema_version != 1 {
        return Err(ResourceManagerError::manifest(
            "不支持的受管资源 manifest 版本",
        ));
    }
    let mut resource_ids = BTreeSet::new();
    for resource in &manifest.resources {
        if resource.resource_id.trim().is_empty()
            || resource.license.trim().is_empty()
            || resource.notice.trim().is_empty()
            || !resource_ids.insert(resource.resource_id.as_str())
        {
            return Err(ResourceManagerError::manifest("受管资源元数据不完整"));
        }
        let mut platform_keys = BTreeSet::new();
        for release in &resource.releases {
            if release.version.trim().is_empty()
                || !release.source_url.starts_with("https://")
                || !valid_sha256(&release.archive_sha256)
                || release.executables.is_empty()
                || !platform_keys.insert(release.platform_key.as_str())
            {
                return Err(ResourceManagerError::manifest("受管资源 release 不完整"));
            }
            let mut executable_names = BTreeSet::new();
            for executable in &release.executables {
                if executable.name.trim().is_empty()
                    || !safe_relative_path(&executable.relative_path)
                    || !valid_sha256(&executable.sha256)
                    || !executable_names.insert(executable.name.as_str())
                {
                    return Err(ResourceManagerError::manifest("受管资源 executable 不安全"));
                }
            }
        }
    }
    Ok(())
}

fn verify_executable(path: &Path, expected_sha256: &str) -> Result<(), ResourceManagerError> {
    let mut file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ResourceManagerError {
                code: "RESOURCE_FILE_MISSING",
                message: "受管资源尚未安装".to_owned(),
            }
        } else {
            ResourceManagerError::unavailable(error.to_string())
        }
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| ResourceManagerError::unavailable(error.to_string()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hex::encode(hasher.finalize());
    if actual != expected_sha256.to_ascii_lowercase() {
        return Err(ResourceManagerError {
            code: "RESOURCE_INTEGRITY_FAILED",
            message: "受管资源完整性校验失败".to_owned(),
        });
    }
    Ok(())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn safe_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && !value.contains('\\')
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn current_platform_key() -> String {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "darwin-arm64".to_owned(),
        ("macos", "x86_64") => "darwin-x64".to_owned(),
        ("windows", "x86_64") => "win32-x64".to_owned(),
        (os, arch) => format!("{os}-{arch}"),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::*;

    fn test_root() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("limeshot-resources-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&root).expect("create test root");
        root
    }

    fn manifest(sha256: &str, relative_path: &str) -> String {
        format!(
            r#"{{
              "schemaVersion": 1,
              "resources": [{{
                "resourceId": "node",
                "kind": "node_runtime",
                "required": true,
                "license": "Apache-2.0",
                "notice": "test",
                "releases": [{{
                  "platformKey": "test-platform",
                  "version": "1.0.0",
                  "sourceUrl": "https://example.invalid/node.zip",
                  "archiveSha256": "{sha256}",
                  "executables": [{{
                    "name": "node",
                    "relativePath": "{relative_path}",
                    "sha256": "{sha256}"
                  }}]
                }}]
              }}]
            }}"#
        )
    }

    #[test]
    fn reports_unselected_official_releases_as_blocked() {
        let manager = ResourceManager::open(Path::new("unused")).expect("open manifest");
        let resources = manager.list().resources;
        assert_eq!(resources.len(), 2);
        assert!(
            resources
                .iter()
                .all(|resource| resource.state == ResourceState::Blocked)
        );
        assert!(
            resources
                .iter()
                .all(|resource| resource.detail_code == "release_unavailable")
        );
    }

    #[test]
    fn only_returns_a_managed_file_after_hash_verification() {
        let root = test_root();
        let bytes = b"managed-node";
        let sha256 = hex::encode(Sha256::digest(bytes));
        let manager = ResourceManager::from_source(
            &root,
            "test-platform".to_owned(),
            &manifest(&sha256, "bin/node"),
        )
        .expect("open manifest");
        let executable = root.join("node/1.0.0/bin/node");
        fs::create_dir_all(executable.parent().expect("executable parent"))
            .expect("create release");
        fs::write(&executable, bytes).expect("write executable");

        assert_eq!(
            manager.executable("node", "node").expect("verified path"),
            executable
        );
        fs::write(&executable, b"tampered").expect("tamper executable");
        assert_eq!(
            manager
                .executable("node", "node")
                .expect_err("tampered file")
                .code(),
            "RESOURCE_INTEGRITY_FAILED"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_archive_traversal_paths_in_the_manifest() {
        let sha256 = "0".repeat(64);
        let error = ResourceManager::from_source(
            Path::new("unused"),
            "test-platform".to_owned(),
            &manifest(&sha256, "../node"),
        )
        .expect_err("traversal must fail");
        assert_eq!(error.code(), "RESOURCE_MANIFEST_INVALID");
    }
}
