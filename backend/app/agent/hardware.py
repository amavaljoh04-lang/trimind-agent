"""Hardware detection — CPU, GPU, RAM, VRAM info."""

import asyncio
import os
import platform
import re
from dataclasses import dataclass, field


@dataclass
class GPUInfo:
    name: str = "N/A"
    vram_total_mb: int = 0
    vram_used_mb: int = 0
    vram_free_mb: int = 0
    temperature: int = 0
    utilization: int = 0


@dataclass
class HardwareInfo:
    cpu_model: str = "Unknown"
    cpu_cores: int = 0
    cpu_threads: int = 0
    ram_total_gb: float = 0.0
    ram_used_gb: float = 0.0
    ram_free_gb: float = 0.0
    ram_type: str = "Unknown"
    gpus: list[GPUInfo] = field(default_factory=list)
    os_name: str = "Unknown"
    os_version: str = ""

    @property
    def has_gpu(self) -> bool:
        return len(self.gpus) > 0 and self.gpus[0].vram_total_mb > 0

    @property
    def total_vram_gb(self) -> float:
        return sum(g.vram_total_mb for g in self.gpus) / 1024

    def to_dict(self) -> dict:
        return {
            "cpu": {
                "model": self.cpu_model,
                "cores": self.cpu_cores,
                "threads": self.cpu_threads,
            },
            "ram": {
                "total_gb": round(self.ram_total_gb, 1),
                "used_gb": round(self.ram_used_gb, 1),
                "free_gb": round(self.ram_free_gb, 1),
                "type": self.ram_type,
            },
            "gpus": [
                {
                    "name": g.name,
                    "vram_total_mb": g.vram_total_mb,
                    "vram_used_mb": g.vram_used_mb,
                    "vram_free_mb": g.vram_free_mb,
                    "temperature": g.temperature,
                    "utilization": g.utilization,
                }
                for g in self.gpus
            ],
            "os": {"name": self.os_name, "version": self.os_version},
            "has_gpu": self.has_gpu,
            "total_vram_gb": round(self.total_vram_gb, 1),
        }


async def _run_cmd(cmd: str) -> str:
    """Run a shell command and return stdout."""
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        return stdout.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


async def detect_hardware() -> HardwareInfo:
    """Detect system hardware information."""
    info = HardwareInfo()

    # OS
    info.os_name = platform.system()
    info.os_version = platform.release()

    # CPU
    info.cpu_cores = os.cpu_count() or 0
    cpu_info = await _run_cmd("lscpu 2>/dev/null || sysctl -n machdep.cpu.brand_string 2>/dev/null")
    for line in cpu_info.splitlines():
        if "Model name" in line or "brand_string" in line:
            info.cpu_model = line.split(":")[-1].strip()
        if "Thread(s) per core" in line:
            try:
                tpc = int(line.split(":")[-1].strip())
                info.cpu_threads = info.cpu_cores * tpc
            except ValueError:
                info.cpu_threads = info.cpu_cores
    if not info.cpu_threads:
        info.cpu_threads = info.cpu_cores

    # RAM
    meminfo = await _run_cmd("cat /proc/meminfo 2>/dev/null")
    if meminfo:
        for line in meminfo.splitlines():
            if line.startswith("MemTotal"):
                kb = int(re.findall(r"\d+", line)[0])
                info.ram_total_gb = kb / (1024 * 1024)
            elif line.startswith("MemAvailable"):
                kb = int(re.findall(r"\d+", line)[0])
                info.ram_free_gb = kb / (1024 * 1024)
        info.ram_used_gb = info.ram_total_gb - info.ram_free_gb
    else:
        # macOS fallback
        total = await _run_cmd("sysctl -n hw.memsize 2>/dev/null")
        if total:
            info.ram_total_gb = int(total) / (1024 ** 3)

    # RAM type detection
    dmi = await _run_cmd("sudo dmidecode -t memory 2>/dev/null | head -50")
    if "DDR5" in dmi:
        info.ram_type = "DDR5"
    elif "DDR4" in dmi:
        info.ram_type = "DDR4"
    elif "DDR3" in dmi:
        info.ram_type = "DDR3"
    else:
        # Try lshw as fallback
        lshw = await _run_cmd("lshw -class memory -short 2>/dev/null")
        if "DDR5" in lshw:
            info.ram_type = "DDR5"
        elif "DDR4" in lshw:
            info.ram_type = "DDR4"

    # GPU (NVIDIA)
    nvidia_smi = await _run_cmd(
        "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu "
        "--format=csv,noheader,nounits 2>/dev/null"
    )
    if nvidia_smi:
        for line in nvidia_smi.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 6:
                gpu = GPUInfo(
                    name=parts[0],
                    vram_total_mb=int(float(parts[1])),
                    vram_used_mb=int(float(parts[2])),
                    vram_free_mb=int(float(parts[3])),
                    temperature=int(float(parts[4])) if parts[4] != "[N/A]" else 0,
                    utilization=int(float(parts[5])) if parts[5] != "[N/A]" else 0,
                )
                info.gpus.append(gpu)
    else:
        # AMD GPU fallback
        rocm = await _run_cmd("rocm-smi --showmeminfo vram 2>/dev/null")
        if rocm:
            gpu = GPUInfo(name="AMD GPU")
            for line in rocm.splitlines():
                if "Total" in line:
                    nums = re.findall(r"\d+", line)
                    if nums:
                        gpu.vram_total_mb = int(nums[0]) // (1024 * 1024)
                if "Used" in line:
                    nums = re.findall(r"\d+", line)
                    if nums:
                        gpu.vram_used_mb = int(nums[0]) // (1024 * 1024)
            gpu.vram_free_mb = gpu.vram_total_mb - gpu.vram_used_mb
            if gpu.vram_total_mb > 0:
                info.gpus.append(gpu)

    return info
