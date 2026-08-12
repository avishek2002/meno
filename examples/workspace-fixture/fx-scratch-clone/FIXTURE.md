# fx-scratch-clone (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. This project exercises the substantive/non-substantive split
(`docs/specs/subject-finder.md`): it is a real git repository (`FIXTURE-git.json`) but carries
no dependency manifest, no `README*` file (this `FIXTURE.md` doc is a fixture marker, not a
project readme, and does not set `markers.readme`), and only one commit - exactly the shape a
throwaway scratch clone or a quick one-off experiment has. `computeWorkspaceScan` classifies it
`substantive: false`. It still appears in `snapshot.repos` and is still counted in
`aggregate.total_repos`; it is excluded only from `aggregate.marker_coverage`,
`aggregate.dependency_frequency`, and `aggregate.manifest_coverage`'s denominators.
