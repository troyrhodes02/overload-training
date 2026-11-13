/**
 * The QA baseline's value fingerprint (OVE-173): one SHA-256 per section of
 * `qaFingerprint` for a freshly seeded `qa-v1` account, every date relative to
 * the reset day. `qa:verify` compares the account against these, so an edited
 * set, goal, gym, or preference reads as drift even when no row count changes.
 *
 * Regenerate only when the fixture or an application write rule changes the
 * baseline (bump QA_FIXTURE_VERSION with a fixture change):
 * tests/integration/qa-fixture.int.test.ts fails and prints the new values.
 */
export const QA_BASELINE_HASHES: Readonly<Record<string, string>> = {
  baselines: "f681be489fe14f404654e8f6da2f8f9204b7e71c516612406f383cee3b11670e",
  cardio: "4dabf8b0e25d786f924bc9f35f69da10da4f3386395b9b13d92b602be52dec6b",
  cardioPlan:
    "ab483b0ec799f61c2d94585e46c5f825ed0d68dee964c8a1a4b0125335a87e4d",
  custom: "bbfb4aa002369412c0bf3990cd8fcc3641c253d358ca3e81d472e1ece118f6ec",
  favorites: "64878e054fecaeb3213dd3ee061f3e75086ad625434b3f51dd463680a4819b7a",
  goals: "c2a1e370dc108ac62e232e05b3addb399ae5d05cc5198bd1e6140bae1425585d",
  gyms: "95a00bfa3501eb24a4a1a13623c48b3c98ba5cf4c5dcfa8d414479f82fdce710",
  logged: "67462e7eed1f3a6a5f7493e86a7d8ab368e435c34a1a32395bceb0f4cb6813a0",
  mesocycles:
    "118f3812518f38523e2379e5dc38d7b737ee69dd4e1994581b0fd8995116f8ba",
  profile: "2baa593b506c7cc928c4062b330d5d815863a3a0ff58fe878e1acd892b000266",
  resolutions:
    "c9d0c5203387de3faac4d451a6ae495b6b0003e07353da1572defe369efd46da",
  tour: "12be39fdea3651a12e0975c46c3d4981ae2def5381bc7b330109e36221bb43c4",
  version: "ad2deab9ec00963274a08982762e0109472364dd3402923eb7d4701ad792bcd1",
};
