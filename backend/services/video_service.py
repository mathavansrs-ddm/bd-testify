import os
from typing import List

RECORDINGS_DIR = "recordings"


def get_recording_chunks(session_id: int) -> List[str]:
    dir_path = os.path.join(RECORDINGS_DIR, str(session_id))
    if not os.path.exists(dir_path):
        return []
    files = sorted(
        [f for f in os.listdir(dir_path) if f.endswith(".webm")],
        key=lambda x: int(x.replace("chunk_", "").replace(".webm", ""))
    )
    return [os.path.join(dir_path, f) for f in files]


def get_recording_dir(session_id: int) -> str:
    return os.path.join(RECORDINGS_DIR, str(session_id))
