"""Rebuild the three website previews from the audited public library.

Requirements: Node.js, Python 3, numpy, soundfile >= 0.13.
Run: python scripts/render-site-previews.py
Reads public/sounds without modifying it; writes only the three site previews
and their credits. Uses the app DSP at the recordings' native 44.1 kHz.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SECONDS = 20
PREVIEWS = [
    {"file": "forest-rain.ogg", "name": "Forest rain", "nameZh": "深林细雨",
     "mix": {"blanket-rain": .55, "blanket-wind": .35, "blanket-birds": .15}},
    {"file": "ocean-escape.ogg", "name": "Ocean escape", "nameZh": "海边放空",
     "mix": {"blanket-waves": .65, "blanket-wind": .2}},
    {"file": "mountain-stream.ogg", "name": "Mountain stream", "nameZh": "山间溪流",
     "mix": {"blanket-stream": 1.0}},
]
catalog = {s["id"]: s for s in json.loads((ROOT / "src/catalog.public.json").read_text(encoding="utf-8"))}
assets = ROOT / "site/assets"
credits = []
with tempfile.TemporaryDirectory(prefix="quiet-field-previews-") as folder:
    temp = Path(folder)
    sources = []
    for sid in dict.fromkeys(sid for p in PREVIEWS for sid in p["mix"]):
        sound = catalog[sid]
        path = ROOT / "public" / sound["path"].removeprefix("./")
        if hashlib.sha256(path.read_bytes()).hexdigest() != sound["sha256"]:
            raise ValueError(f"Source checksum mismatch: {sid}")
        data, rate = sf.read(path, dtype="float32", always_2d=True)
        if rate != 44100 or data.shape[1] != 2:
            raise ValueError(f"Unexpected source format: {sid}")
        pcm = temp / (sid + ".f32")
        data.astype("<f4").tofile(pcm)
        sources.append({"id": sid, "pcm": str(pcm), "rate": rate,
                        "channels": data.shape[1], "crossfade": sound.get("crossfade", 4)})
    previews = [{**p, "pcm": str(temp / (p["file"] + ".f32"))} for p in PREVIEWS]
    job = {"sources": sources, "previews": previews, "seconds": SECONDS,
           "report": str(temp / "report.json")}
    job_path = temp / "job.json"
    job_path.write_text(json.dumps(job), encoding="utf-8")
    subprocess.run(["node", str(ROOT / "scripts/render-site-previews.mjs"), str(job_path)],
                   check=True, cwd=ROOT)
    reports = json.loads((temp / "report.json").read_text(encoding="utf-8"))
    for preview, report in zip(previews, reports):
        data = np.fromfile(preview["pcm"], dtype="<f4").reshape(-1, 2)
        rms = float(np.sqrt(np.mean(data.astype("float64") ** 2)))
        gain = min(.12 / rms, .85 / float(np.max(np.abs(data))))
        data *= gain
        for count, start in [(round(rate * .8), True), (round(rate * 1.2), False)]:
            ramp = .5 - .5 * np.cos(np.linspace(0, np.pi, count))
            if start:
                data[:count] *= ramp[:, None]
            else:
                data[-count:] *= ramp[::-1, None]
        destination = assets / preview["file"]
        # libsndfile's Windows Vorbis encoder can exhaust the native stack
        # on a large single write; bounded blocks also cap encoding memory.
        with sf.SoundFile(destination, mode="w", samplerate=rate, channels=2,
                          format="OGG", subtype="VORBIS", compression_level=.2) as output:
            for start in range(0, len(data), 8192):
                output.write(data[start:start + 8192])
        decoded, decoded_rate = sf.read(destination, dtype="float32", always_2d=True)
        peak = float(np.max(np.abs(decoded)))
        decoded_rms = float(np.sqrt(np.mean(decoded.astype("float64") ** 2)))
        if not (np.isfinite(decoded).all() and peak < .98 and decoded.shape == (rate * SECONDS, 2)):
            raise ValueError(f"Invalid encoded preview: {destination}")
        layers = []
        for layer in report["layers"]:
            sound = catalog[layer["soundId"]]
            layers.append({**layer, **{k: sound.get(k, "") for k in
                ["title", "author", "editor", "source", "license", "licenseURL",
                 "provenance", "sha256"]}})
        has_attribution = any(s["license"] == "CC BY 4.0" for s in layers)
        credits.append({
            "file": preview["file"], "name": preview["name"], "nameZh": preview["nameZh"],
            "durationSeconds": SECONDS, "sampleRate": decoded_rate, "channels": 2,
            "license": "CC BY 4.0" if has_attribution else "CC0 1.0",
            "licenseURL": "https://creativecommons.org/licenses/by/4.0/" if has_attribution
                else "https://creativecommons.org/publicdomain/zero/1.0/",
            "adaptedBy": "Quiet Field contributors", "layers": layers,
            "processing": "App loop crossfades and per-track loudness normalization at native 44.1 kHz; "
                "preset layer gains and bus balance; first 20 seconds of processed loops mixed, "
                "web master level matched with peak headroom; 800 ms fade-in / 1200 ms fade-out; "
                "Ogg Vorbis re-encode (compression_level=0.2). No app master/compressor emulation. "
                "Source recordings unchanged.",
            "webGainDb": float(20 * np.log10(gain)), "decodedPeak": peak, "decodedRms": decoded_rms,
        })
        print(f'{preview["file"]}: {SECONDS}s, {destination.stat().st_size} bytes, '
              f'peak={peak:.4f}, RMS={decoded_rms:.4f}')
    (assets / "preview-credits.json").write_text(
        json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
