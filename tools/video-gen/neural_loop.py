"""
Gerador de vídeo: loop seamless de rede neural com partículas conectadas.
Cores: Purple iris (#6A4BF0), Lilac (#A78CFF), fundo escuro (#0A0C1A).
Saída: MP4 16:9, 6 segundos, loop perfeito.

Dependências:
    pip install numpy opencv-python
"""

import numpy as np
import cv2
import math

# === CONFIGURAÇÕES ===
WIDTH, HEIGHT = 1920, 1080
FPS = 30
DURATION = 6  # segundos
TOTAL_FRAMES = FPS * DURATION
OUTPUT_FILE = "neural_network_loop.mp4"

# Cores (BGR para OpenCV)
BG_COLOR = (26, 12, 10)        # #0A0C1A
IRIS_BGR = (240, 75, 106)      # #6A4BF0
LILAC_BGR = (255, 140, 167)    # #A78CFF

NUM_NODES = 80
CONNECTION_DIST = 280
NUM_TRAILS = 25


def lerp_color(c1, c2, t):
    """Interpola entre duas cores."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def ease_in_out(t):
    """Suavização senoidal."""
    return 0.5 - 0.5 * math.cos(t * 2 * math.pi)


class Node:
    def __init__(self):
        self.x = np.random.uniform(50, WIDTH - 50)
        self.y = np.random.uniform(50, HEIGHT - 50)
        # Velocidades base para movimento orbital (loop perfeito)
        self.freq_x = np.random.choice([1.0, 2.0, 3.0])
        self.freq_y = np.random.choice([1.0, 2.0, 3.0])
        self.amp_x = np.random.uniform(20, 60)
        self.amp_y = np.random.uniform(20, 60)
        self.phase_x = np.random.uniform(0, 2 * math.pi)
        self.phase_y = np.random.uniform(0, 2 * math.pi)
        self.base_x = self.x
        self.base_y = self.y
        self.radius = np.random.uniform(2, 5)
        self.color = lerp_color(IRIS_BGR, LILAC_BGR, np.random.random())

    def position_at(self, t):
        """Posição no tempo t (0..1) — retorna ao início quando t=1."""
        angle = t * 2 * math.pi
        x = self.base_x + self.amp_x * math.sin(self.freq_x * angle + self.phase_x)
        y = self.base_y + self.amp_y * math.sin(self.freq_y * angle + self.phase_y)
        x = np.clip(x, 10, WIDTH - 10)
        y = np.clip(y, 10, HEIGHT - 10)
        return int(x), int(y)


class Trail:
    def __init__(self, nodes):
        self.nodes = nodes
        self.speed = np.random.uniform(0.5, 1.5)
        self.offset = np.random.uniform(0, 1)
        self.path = self._build_path()
        self.color = lerp_color(IRIS_BGR, LILAC_BGR, np.random.uniform(0.3, 0.9))

    def _build_path(self):
        """Seleciona uma sequência de nós para o trail percorrer."""
        start = np.random.randint(0, len(self.nodes))
        path = [start]
        for _ in range(np.random.randint(3, 7)):
            last = path[-1]
            candidates = []
            for i, n in enumerate(self.nodes):
                if i != last and i not in path:
                    dx = n.base_x - self.nodes[last].base_x
                    dy = n.base_y - self.nodes[last].base_y
                    dist = math.sqrt(dx*dx + dy*dy)
                    if dist < CONNECTION_DIST * 1.5:
                        candidates.append(i)
            if candidates:
                path.append(np.random.choice(candidates))
            else:
                break
        return path

    def position_at(self, t):
        """Posição do trail no tempo t."""
        progress = ((t * self.speed + self.offset) % 1.0) * (len(self.path) - 1)
        idx = int(progress)
        frac = progress - idx
        if idx >= len(self.path) - 1:
            return None
        n1 = self.path[idx]
        n2 = self.path[idx + 1]
        p1 = self.nodes[n1].position_at(t)
        p2 = self.nodes[n2].position_at(t)
        x = int(p1[0] + (p2[0] - p1[0]) * frac)
        y = int(p1[1] + (p2[1] - p1[1]) * frac)
        return x, y


def get_connections(nodes, t):
    """Retorna pares de nós conectados (distância < threshold)."""
    connections = []
    positions = [n.position_at(t) for n in nodes]
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dist = math.sqrt(dx*dx + dy*dy)
            if dist < CONNECTION_DIST:
                alpha = 1.0 - (dist / CONNECTION_DIST)
                connections.append((i, j, alpha, positions[i], positions[j]))
    return connections


def render_frame(nodes, trails, t):
    """Renderiza um frame no tempo t (0..1)."""
    frame = np.full((HEIGHT, WIDTH, 3), BG_COLOR, dtype=np.uint8)

    # Conexões
    connections = get_connections(nodes, t)
    for (i, j, alpha, p1, p2) in connections:
        color = lerp_color(BG_COLOR, IRIS_BGR, alpha * 0.4)
        thickness = max(1, int(alpha * 2))
        cv2.line(frame, p1, p2, color, thickness, cv2.LINE_AA)

    # Trails (light trails viajando pelas conexões)
    for trail in trails:
        pos = trail.position_at(t)
        if pos:
            # Glow effect
            cv2.circle(frame, pos, 8, lerp_color(BG_COLOR, trail.color, 0.3), -1, cv2.LINE_AA)
            cv2.circle(frame, pos, 4, trail.color, -1, cv2.LINE_AA)
            cv2.circle(frame, pos, 2, (255, 255, 255), -1, cv2.LINE_AA)

    # Nós
    for node in nodes:
        pos = node.position_at(t)
        # Glow externo
        cv2.circle(frame, pos, int(node.radius * 3), lerp_color(BG_COLOR, node.color, 0.2), -1, cv2.LINE_AA)
        # Nó principal
        cv2.circle(frame, pos, int(node.radius), node.color, -1, cv2.LINE_AA)
        # Centro brilhante
        cv2.circle(frame, pos, max(1, int(node.radius * 0.4)), (255, 255, 255), -1, cv2.LINE_AA)

    return frame


def main():
    print("Gerando nós...")
    np.random.seed(42)  # Seed fixa para reprodutibilidade
    nodes = [Node() for _ in range(NUM_NODES)]

    print("Gerando trails...")
    trails = [Trail(nodes) for _ in range(NUM_TRAILS)]

    print(f"Renderizando {TOTAL_FRAMES} frames ({DURATION}s @ {FPS}fps)...")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(OUTPUT_FILE, fourcc, FPS, (WIDTH, HEIGHT))

    for frame_idx in range(TOTAL_FRAMES):
        t = frame_idx / TOTAL_FRAMES  # 0..1 loop perfeito
        frame = render_frame(nodes, trails, t)
        writer.write(frame)

        if (frame_idx + 1) % 30 == 0:
            pct = int((frame_idx + 1) / TOTAL_FRAMES * 100)
            print(f"  [{pct:3d}%] Frame {frame_idx + 1}/{TOTAL_FRAMES}")

    writer.release()
    print(f"\n✅ Vídeo gerado: {OUTPUT_FILE}")
    print(f"   Resolução: {WIDTH}x{HEIGHT} (16:9)")
    print(f"   Duração: {DURATION}s | FPS: {FPS} | Loop: seamless")


if __name__ == "__main__":
    main()
