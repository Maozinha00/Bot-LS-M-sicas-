# Use Node.js 18 Bullseye (inclui suporte nativo a FFmpeg e dependências C++)
FROM node:18-bullseye-slim

# Instala ffmpeg e bibliotecas de compilação essenciais para o mediaplex/discord-player
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia arquivos de dependência
COPY package*.json ./

# Instala dependências de produção sem avisos de depreciação
RUN npm install --omit=dev

# Copia todo o código-fonte
COPY . .

# Comando de inicialização
CMD ["node", "index.js"]
