# Dockerfile Otimizado para Railway — LS MÚSICAS
FROM node:20-slim

# Instala dependências do sistema para suporte de áudio e compilação nativa (FFmpeg e Python)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia os arquivos de manifesto do pacote
COPY package*.json ./

# Usa 'npm install --omit=dev' em vez de 'npm ci' para garantir build sem erros
RUN npm install --omit=dev

# Copia o código-fonte
COPY . .

ENV NODE_ENV=production

# Comando para iniciar o bot
CMD ["node", "index.js"]
