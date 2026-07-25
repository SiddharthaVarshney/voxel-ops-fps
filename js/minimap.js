export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.visible = false;
  }

  toggle() {
    this.visible = !this.visible;
    this.canvas.classList.toggle("hidden", !this.visible);
  }

  draw(player, enemyManager, arenaHalf) {
    if (!this.visible) return;
    const ctx = this.ctx;
    const size = this.canvas.width;
    const scale = (size / 2 - 10) / arenaHalf;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "rgba(10, 12, 10, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffb100";
    ctx.lineWidth = 2;
    ctx.stroke();

    // telegraphed spawn points — pulsing red
    for (const p of enemyManager.pendingSpawns) {
      const px = cx + p.x * scale;
      const py = cy + p.z * scale;
      const pulse = 3 + Math.sin(p.timer * 20) * 1.5;
      ctx.fillStyle = "rgba(255, 43, 43, 0.9)";
      ctx.beginPath();
      ctx.arc(px, py, pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // enemies — colored by type
    for (const e of enemyManager.enemies) {
      if (e.state !== "alive") continue;
      const px = cx + e.position.x * scale;
      const py = cy + e.position.z * scale;
      ctx.fillStyle = e.type === "mutant_brute" ? "#ff3d3d" : e.type === "drone" ? "#5ec8ff" : "#ff8a3d";
      ctx.beginPath();
      ctx.arc(px, py, e.type === "mutant_brute" ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // player — green arrow showing facing
    const ppx = cx + player.position.x * scale;
    const ppy = cy + player.position.z * scale;
    ctx.save();
    ctx.translate(ppx, ppy);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = "#7cfc00";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
