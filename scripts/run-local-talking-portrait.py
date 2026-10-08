"""Run the locally installed SadTalker CLI. No provider or credential access."""
import os
import runpy
import sys
from pathlib import Path

project = Path(__file__).resolve().parent.parent
storage = project / "storage"
engine = storage / "tools" / "sadtalker"
if not (engine / "inference.py").is_file():
    raise SystemExit("Install the official OpenTalker/SadTalker source in storage/tools/sadtalker first.")

# NumPy 1.24+ requires explicit scalars when mixing scalar and one-element arrays.
# Apply only this exact compatibility edit to the local, untracked engine copy.
alignment = engine / "src" / "face3d" / "util" / "preprocess.py"
old_line = "np.array([w0, h0, s, t[0], t[1]])"
new_line = "np.array([w0, h0, float(s), float(t[0]), float(t[1])])"
source = alignment.read_text(encoding="utf-8")
if old_line in source:
    alignment.write_text(source.replace(old_line, new_line), encoding="utf-8")

arguments = sys.argv[1:]
render_size = 256
render_stride = 1
if "--render-stride" in arguments:
    index = arguments.index("--render-stride")
    render_stride = int(arguments[index + 1])
    del arguments[index:index + 2]
if render_stride not in (1, 2, 3):
    raise SystemExit("--render-stride supports 1, 2 or 3; skipped facial frames are interpolated.")
if "--render-size" in arguments:
    index = arguments.index("--render-size")
    render_size = int(arguments[index + 1])
    del arguments[index:index + 2]
if render_size not in (128, 256):
    raise SystemExit("--render-size supports 128 (experimental CPU preview) or 256.")
# Validate paths before importing the expensive inference dependencies.
for option in ("--source_image", "--driven_audio", "--result_dir"):
    if option not in arguments or arguments.index(option) + 1 >= len(arguments):
        raise SystemExit(f"Missing required local path: {option}")
    index = arguments.index(option) + 1
    target = Path(arguments[index]).resolve()
    if not target.is_relative_to(storage):
        raise SystemExit(f"{option} must be inside project storage.")
    if option != "--result_dir" and not target.is_file():
        raise SystemExit(f"Missing input file: {target}")
    arguments[index] = str(target)

cache = storage / "tools" / "sadtalker-cache"
for name, folder in {
    "TORCH_HOME": "torch", "HF_HOME": "huggingface", "XDG_CACHE_HOME": "xdg",
    "NUMBA_CACHE_DIR": "numba", "MPLCONFIGDIR": "matplotlib",
}.items():
    target = cache / folder
    target.mkdir(parents=True, exist_ok=True)
    os.environ[name] = str(target)
ffmpeg = storage / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe"
if not ffmpeg.is_file():
    raise SystemExit("Place ffmpeg.exe in storage/tools/ffmpeg/bin first.")
os.environ["PATH"] = str(ffmpeg.parent) + os.pathsep + os.environ.get("PATH", "")
os.environ["IMAGEIO_FFMPEG_EXE"] = str(ffmpeg)
os.environ["OMP_NUM_THREADS"] = "4"
os.environ["MKL_NUM_THREADS"] = "4"

# Compatibility for the official engine's older dependency imports on Python 3.12.
import numpy as np
for name, value in {"complex": complex, "float": float, "int": int}.items():
    if name not in np.__dict__:
        setattr(np, name, value)
from PIL import Image
if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS
import torch
import torchvision.transforms.functional as functional
sys.modules.setdefault("torchvision.transforms.functional_tensor", functional)
torch.set_num_threads(4)
torch.set_num_interop_threads(1)
torch.manual_seed(42)
np.random.seed(42)

os.chdir(engine)
sys.path.insert(0, str(engine))
if render_stride != 1:
    import src.facerender.modules.make_animation as animation
    original_animation = animation.make_animation
    def render_sampled_frames(source_image, source_semantics, target_semantics, *args, **kwargs):
        frame_count = target_semantics.shape[1]
        positions = list(range(0, frame_count, render_stride))
        if positions[-1] != frame_count - 1:
            positions.append(frame_count - 1)
        args = list(args)
        for index in range(4, min(7, len(args))):
            if args[index] is not None:
                args[index] = args[index][:, positions]
        for key in ("yaw_c_seq", "pitch_c_seq", "roll_c_seq"):
            if kwargs.get(key) is not None:
                kwargs[key] = kwargs[key][:, positions]
        frames = original_animation(source_image, source_semantics, target_semantics[:, positions], *args, **kwargs)
        sampled = torch.tensor(positions, device=frames.device)
        timeline = torch.arange(frame_count, device=frames.device)
        right = torch.searchsorted(sampled, timeline).clamp(max=len(positions) - 1)
        left = (right - 1).clamp(min=0)
        weight = ((timeline - sampled[left]) / (sampled[right] - sampled[left]).clamp(min=1)).view(1, frame_count, 1, 1, 1)
        return frames[:, left] * (1 - weight) + frames[:, right] * weight
    animation.make_animation = render_sampled_frames

# This CLI animates one immutable source image. Cache its frozen encoder trunk;
# only the audio-driven deformation and decoder need to run for every frame.
import src.facerender.animate as face_rendering
original_initialize = face_rendering.AnimateFromCoeff.__init__
def initialize_cached_source(self, *args, **kwargs):
    original_initialize(self, *args, **kwargs)
    def cached_forward(module):
        original = module.forward
        cached = []
        def forward(*inputs, **options):
            if not cached:
                cached.append(original(*inputs, **options))
            return cached[0]
        module.forward = forward
    for layer in [self.generator.first, *self.generator.down_blocks,
                  self.generator.second, self.generator.resblocks_3d]:
        cached_forward(layer)
face_rendering.AnimateFromCoeff.__init__ = initialize_cached_source
# Smaller rendering uses the same 256 checkpoint, without changing audio timing.
if render_size != 256:
    import src.generate_facerender_batch as rendering
    original_get_data = rendering.get_facerender_data
    def get_small_render_data(*args, **kwargs):
        kwargs["size"] = render_size
        return original_get_data(*args, **kwargs)
    rendering.get_facerender_data = get_small_render_data
sys.argv = [str(engine / "inference.py"), *arguments, "--cpu", "--checkpoint_dir", str(engine / "checkpoints")]
runpy.run_path(str(engine / "inference.py"), run_name="__main__")
