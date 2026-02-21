#!/usr/bin/env python3
"""Convert .aif stimuli to .mp3 with obfuscated filenames and generate
trial sequence definitions.

Usage:
    python prepare_stimuli.py [--source-dir PATH] [--seed SEED]
"""

import argparse
import json
import re
import secrets
import random
import subprocess
from multiprocessing import Pool
from pathlib import Path

from tqdm import tqdm

SOURCE_DIR_DEFAULT = Path.home() / "google_drive/tonicization_experiment_materials/Bounces"
FILENAME_PATTERN = re.compile(
    r"^A (modulation|tonicization) \| 1 probe([2-7])_(complete|probe)\.aif$"
)
PROBES_WITH_TWO_CONDITIONS = {2, 3, 4, 5}
PROBES_SINGLE_CONDITION = {6, 7}
TRIALS_PER_SEQUENCE = 6


def parse_source_files(source_dir: Path) -> list[dict]:
    """Find and parse all matching audio files."""
    files = []
    for path in sorted(source_dir.iterdir()):
        m = FILENAME_PATTERN.match(path.name)
        if m:
            files.append({
                "path": path,
                "condition": m.group(1),
                "probe": int(m.group(2)),
                "phase": m.group(3),
            })
    return files


def generate_obfuscated_name() -> str:
    return secrets.token_hex(4) + ".mp3"


def convert_file(args: tuple[Path, Path]) -> None:
    """Convert a single .aif file to .mp3."""
    src, dst = args
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(src),
            "-codec:a", "libmp3lame", "-qscale:a", "2",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir", type=Path, default=SOURCE_DIR_DEFAULT,
        help="Path to the Bounces directory",
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Random seed for reproducibility",
    )
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    output_dir = Path(__file__).parent
    audio_dir = output_dir / "audio"
    audio_dir.mkdir(exist_ok=True)

    # --- Parse source files ---
    files = parse_source_files(args.source_dir)
    assert len(files) == 20, f"Expected 20 files, found {len(files)}"

    # --- Group by (condition, probe) -> {phase: file_info} ---
    grouped: dict[tuple[str, int], dict[str, dict]] = {}
    for f in files:
        key = (f["condition"], f["probe"])
        grouped.setdefault(key, {})[f["phase"]] = f

    # --- Generate obfuscated names and build conversion tasks ---
    obfuscated_names: set[str] = set()
    # Maps (condition, probe, phase) -> obfuscated filename
    name_map: dict[tuple[str, int, str], str] = {}
    # For stimulus_key.json: obfuscated -> original
    stimulus_key: dict[str, str] = {}

    conversion_tasks: list[tuple[Path, Path]] = []

    for (condition, probe), phases in grouped.items():
        for phase, info in phases.items():
            name = generate_obfuscated_name()
            while name in obfuscated_names:
                name = generate_obfuscated_name()
            obfuscated_names.add(name)

            name_map[(condition, probe, phase)] = name
            stimulus_key[name] = info["path"].name
            conversion_tasks.append((info["path"], audio_dir / name))

    assert len(obfuscated_names) == 20

    # --- Convert files ---
    print(f"Converting {len(conversion_tasks)} files...")
    with Pool() as pool:
        list(tqdm(
            pool.imap_unordered(convert_file, conversion_tasks),
            total=len(conversion_tasks),
        ))

    # --- Verify all mp3 files exist ---
    for name in obfuscated_names:
        assert (audio_dir / name).exists(), f"Missing: {name}"

    # --- Build sequences ---
    # For probes 2-5, randomly assign conditions to A and B
    condition_assignment_a: dict[int, str] = {}
    for probe in sorted(PROBES_WITH_TWO_CONDITIONS):
        condition_assignment_a[probe] = random.choice(["modulation", "tonicization"])

    def build_trial(condition: str, probe: int) -> dict:
        trial_id = f"probe{probe}_{condition}"
        return {
            "trial_id": trial_id,
            "complete_audio": name_map[(condition, probe, "complete")],
            "probe_audio": name_map[(condition, probe, "probe")],
        }

    def complement(cond: str) -> str:
        return "tonicization" if cond == "modulation" else "modulation"

    seq_a_trials = []
    seq_b_trials = []

    for probe in sorted(PROBES_WITH_TWO_CONDITIONS):
        cond_a = condition_assignment_a[probe]
        cond_b = complement(cond_a)
        seq_a_trials.append(build_trial(cond_a, probe))
        seq_b_trials.append(build_trial(cond_b, probe))

    for probe in sorted(PROBES_SINGLE_CONDITION):
        trial = build_trial("tonicization", probe)
        seq_a_trials.append(trial)
        seq_b_trials.append(trial)

    # Shuffle independently
    random.shuffle(seq_a_trials)
    random.shuffle(seq_b_trials)

    # --- Assertions ---
    assert len(seq_a_trials) == TRIALS_PER_SEQUENCE
    assert len(seq_b_trials) == TRIALS_PER_SEQUENCE

    # Complementary: for probes 2-5, A and B have opposite conditions
    a_conditions = {
        t["trial_id"].split("_")[0]: t["trial_id"].split("_")[1]
        for t in seq_a_trials if int(t["trial_id"][5]) in PROBES_WITH_TWO_CONDITIONS
    }
    b_conditions = {
        t["trial_id"].split("_")[0]: t["trial_id"].split("_")[1]
        for t in seq_b_trials if int(t["trial_id"][5]) in PROBES_WITH_TWO_CONDITIONS
    }
    for probe_key in a_conditions:
        assert a_conditions[probe_key] != b_conditions[probe_key], (
            f"Sequences not complementary for {probe_key}"
        )

    # Probes 6-7 same in both
    a_shared = {t["trial_id"] for t in seq_a_trials if t["trial_id"].startswith(("probe6", "probe7"))}
    b_shared = {t["trial_id"] for t in seq_b_trials if t["trial_id"].startswith(("probe6", "probe7"))}
    assert a_shared == b_shared

    # --- Write output ---
    trials = {"A": seq_a_trials, "B": seq_b_trials}
    trials_path = output_dir / "trials.json"
    trials_path.write_text(json.dumps(trials, indent=2) + "\n")
    print(f"Wrote {trials_path}")

    key_path = output_dir / "stimulus_key.json"
    key_path.write_text(json.dumps(stimulus_key, indent=2) + "\n")
    print(f"Wrote {key_path}")

    # Print summary
    print("\nSequence A:")
    for t in seq_a_trials:
        print(f"  {t['trial_id']}")
    print("\nSequence B:")
    for t in seq_b_trials:
        print(f"  {t['trial_id']}")


if __name__ == "__main__":
    main()
