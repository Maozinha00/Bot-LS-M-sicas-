# Usa Node.js 18 Bullseye (suporte nativo a FFmpeg e dependências C++)
FROM node:18-bullseye-slim

# Instala ffmpeg e ferramentas de compilação essenciais para o mediaplex/discord-player
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

CMD ["node", "index.js"]
