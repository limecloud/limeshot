use business_protocol::{CapabilityDescriptor, CapabilityListResult};
use serde::Deserialize;

const CATALOG_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/providers/catalog.v1.json"
));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityCatalog {
    catalog_version: u32,
    capabilities: Vec<CapabilityDescriptor>,
}

pub fn list_capabilities() -> CapabilityListResult {
    let catalog: CapabilityCatalog =
        serde_json::from_str(CATALOG_SOURCE).expect("capability catalog must be valid JSON");
    CapabilityListResult {
        catalog_version: catalog.catalog_version,
        capabilities: catalog.capabilities,
    }
}

#[cfg(test)]
mod tests {
    use business_protocol::CapabilityAvailability;

    use super::*;

    #[test]
    fn exposes_provider_neutral_capabilities_as_unavailable_until_configured() {
        let catalog = list_capabilities();
        assert_eq!(catalog.catalog_version, 1);
        assert_eq!(catalog.capabilities.len(), 7);
        assert!(
            catalog
                .capabilities
                .iter()
                .all(|capability| capability.availability == CapabilityAvailability::Unavailable)
        );
    }
}
