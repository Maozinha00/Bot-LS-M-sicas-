# Dockerfile otimizado para Railway para o LS Músicas
FROM node:20-slim
# Instala dependências de áudio e compilação do sistema (FFmpeg e Python para native addons)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
CMD ["node", "index.js"]
