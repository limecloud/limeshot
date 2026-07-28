use business_protocol::{SkillDescriptor, SkillListResult};
use serde::Deserialize;

const CATALOG_SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../resources/skills/catalog.v1.json"
));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillCatalog {
    catalog_version: u32,
    skills: Vec<SkillDescriptor>,
}

pub fn list_skills() -> SkillListResult {
    let catalog: SkillCatalog =
        serde_json::from_str(CATALOG_SOURCE).expect("skill catalog must be valid JSON");
    SkillListResult {
        catalog_version: catalog.catalog_version,
        skills: catalog.skills,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_every_business_profile_to_a_skill() {
        let catalog = list_skills();
        assert_eq!(catalog.catalog_version, 1);
        assert_eq!(catalog.skills.len(), 6);
        assert!(
            catalog
                .skills
                .iter()
                .any(|skill| skill.profile_id == "visual_transform")
        );
    }
}
