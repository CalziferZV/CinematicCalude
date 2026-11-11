"""Genera la máscara alfa de Yampi (figura + mano) con un modelo ISNet en ONNX.

Uso: python tools/segment.py <modelo.onnx> <imagen> <salida_mask.png>
"""
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image


def run(model_path, img_path, out_path, size=1024):
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    print("input:", inp.name, inp.shape, inp.type)
    im = Image.open(img_path).convert("RGB")
    W, H = im.size
    x = np.asarray(im.resize((size, size), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - 0.5) / 1.0  # ISNet: mean 0.5, std 1.0
    x = x.transpose(2, 0, 1)[None]
    if "float16" in inp.type:
        x = x.astype(np.float16)
    out = sess.run(None, {inp.name: x})[0]
    m = out[0, 0].astype(np.float32)
    m = (m - m.min()) / (m.max() - m.min() + 1e-8)
    mask = Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    mask.save(out_path)
    print("saved", out_path, mask.size)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], sys.argv[3])
