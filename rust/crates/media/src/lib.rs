use business_protocol::{ServiceDescriptor, ServiceListResult};
use serde::Deserialize;

const CATALOG_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/services/catalog.v1.json"
));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceCatalog {
    catalog_version: u32,
    services: Vec<ServiceDescriptor>,
}

pub fn list_services() -> ServiceListResult {
    let catalog: ServiceCatalog =
        serde_json::from_str(CATALOG_SOURCE).expect("service catalog must be valid JSON");
    ServiceListResult {
        catalog_version: catalog.catalog_version,
        services: catalog.services,
    }
}

#[cfg(test)]
mod tests {
    use business_protocol::ResourceState;

    use super::*;

    #[test]
    fn reports_missing_managed_media_runtime_without_path_fallback() {
        let catalog = list_services();
        assert_eq!(catalog.catalog_version, 1);
        assert!(catalog.services.iter().any(|service| {
            service.service_id == "media.probe" && service.state == ResourceState::Blocked
        }));
    }
}
