# Use Node.js 18 Bullseye (suporte nativo a FFmpeg e pacotes de áudio)
FROM node:18-bullseye-slim

# Instala ffmpeg e ferramentas de compilação C++
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Instala apenas dependências de produção (Sem o aviso de depreciação)
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
