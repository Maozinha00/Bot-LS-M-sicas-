// =========================================================================
// 🎵 LS MÚSICAS — BOT DE MÚSICA COMPLETO PARA DISCORD (index.js)
// Estilo Jockie Music com Slash Commands (/play, /pause, /queue, /volume, etc)
// =========================================================================

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { Player, QueryType } = require('discord-player');

// 🔑 CONFIGURAÇÃO DO TOKEN, SERVIDOR E CANAL DE VOZ PERMITIDO
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "SEU_TOKEN_DO_BOT_AQUI";
const GUILD_ID = process.env.GUILD_ID || "1535806745816072245";
const ALLOWED_VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || "1536307840208338944";

// Inicializa o Cliente do Discord com os privilégios de Voz e Mensagens
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Inicializa o Player de Áudio
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  }
});

// =========================================================================
// 🚀 DEFINIÇÃO DOS COMANDOS SLASH (/)
// =========================================================================
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música por nome ou link (YouTube/Spotify)')
    .addStringOption(option =>
      option.setName('música')
        .setDescription('Nome ou link da música/playlist')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa a música atual'),
  new SlashCommandBuilder().setName('resume').setDescription('Continua a reprodução da música pausada'),
  new SlashCommandBuilder().setName('skip').setDescription('Pula para a próxima música da fila'),
  new SlashCommandBuilder().setName('stop').setDescription('Para a reprodução e sai do canal de voz'),
  new SlashCommandBuilder().setName('queue').setDescription('Exibe a fila de músicas atual'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Mostra a música que está tocando agora'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume do bot (0 a 100%)')
    .addIntegerOption(option =>
      option.setName('nível')
        .setDescription('Porcentagem do volume (0 a 100)')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('shuffle').setDescription('Embaralha as músicas da fila de espera'),
  new SlashCommandBuilder().setName('clear').setDescription('Limpa todas as músicas da fila de espera'),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove uma música da fila pela posição')
    .addIntegerOption(option =>
      option.setName('posição')
        .setDescription('Número da posição na fila')
        .setRequired(true)
    ),
].map(command => command.toJSON());

// =========================================================================
// ⚙️ EVENTO DE INICIALIZAÇÃO E REGISTRO DE COMANDOS
// =========================================================================
client.once('ready', async () => {
  try {
    await player.extractors.loadDefault();
  } catch (err) {
    console.log('Aviso extratores:', err.message);
  }

  console.log("\n==================================================");
  console.log("🎵 LS Músicas online com sucesso como " + client.user.tag + "!");
  console.log("ID do Servidor Alvo: " + GUILD_ID);
  console.log("Canal de Voz Permitido: " + ALLOWED_VOICE_CHANNEL_ID);
  console.log("==================================================\n");

  client.user.setActivity('🎵 LS Músicas | /play', { type: 2 });

  // Registrar Comandos Slash no servidor do Discord
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('🔄 Registrando comandos Slash (/) no Discord...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandos Slash registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
});

// =========================================================================
// 🎛️ GERENCIADOR DE INTERAÇÕES E COMANDOS
// =========================================================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const memberVoiceChannel = interaction.member?.voice?.channel;

  // Tratar Cliques nos Botões do Painel Interativo
  if (interaction.isButton()) {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ Nenhuma música está tocando no momento!', ephemeral: true });
    }

    switch (interaction.customId) {
      case 'btn_pause_resume':
        queue.node.pause() ? queue.node.resume() : queue.node.pause();
        return interaction.reply({ content: queue.node.isPaused() ? '⏸️ Música pausada!' : '▶️ Música retomada!', ephemeral: true });
      case 'btn_skip':
        queue.node.skip();
        return interaction.reply({ content: '⏭️ Música pulada!', ephemeral: true });
      case 'btn_stop':
        queue.delete();
        return interaction.reply({ content: '⏹️ Reprodução parada e fila limpa!', ephemeral: true });
      case 'btn_queue':
        const tracks = queue.tracks.toArray().map((t, i) => (i + 1) + ". **" + t.title + "**").join('\n');
        return interaction.reply({ content: "📋 **Fila Atual:**\n" + (tracks || 'A fila está vazia!'), ephemeral: true });
    }
  }

  // Comandos Slash
  const { commandName } = interaction;

  if (commandName === 'play') {
    if (!memberVoiceChannel) {
      return interaction.reply({ content: '❌ Você precisa entrar em um canal de voz primeiro!', ephemeral: true });
    }

    // 🔒 RESTRIÇÃO DE CANAL DE VOZ
    if (ALLOWED_VOICE_CHANNEL_ID && memberVoiceChannel.id !== ALLOWED_VOICE_CHANNEL_ID) {
      return interaction.reply({
        content: "❌ Este bot está configurado para entrar e tocar EXCLUSIVAMENTE no canal de voz <#" + ALLOWED_VOICE_CHANNEL_ID + ">!",
        ephemeral: true
      });
    }

    const query = interaction.options.getString('música');
    await interaction.deferReply();

    try {
      // 🔍 Busca inteligente no YouTube e links diretos
      let searchResult = await player.search(query, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO
      });

      if (!searchResult.hasTracks()) {
        searchResult = await player.search(query, {
          requestedBy: interaction.user,
          searchEngine: QueryType.YOUTUBE_SEARCH
        });
      }

      if (!searchResult.hasTracks()) {
        return interaction.followUp("❌ Nenhuma música encontrada para: **" + query + "**");
      }

      const { track } = await player.play(memberVoiceChannel, searchResult, {
        nodeOptions: {
          metadata: interaction.channel,
          volume: 80,
          bufferingTimeout: 3000,
          leaveOnEnd: false,
          leaveOnEmpty: true,
        }
      });

      // Embed estilo Jockie Music / LS Músicas
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎵 LS MÚSICAS — Adicionada à Fila')
        .setDescription("🎶 **[" + track.title + "](" + track.url + ")**\n👤 Artista: **" + track.author + "**")
        .addFields(
          { name: '👤 Pedido por', value: "" + interaction.user, inline: true },
          { name: '⏱️ Duração', value: "" + track.duration, inline: true },
          { name: '🔊 Volume', value: '80%', inline: true }
        )
        .setThumbnail(track.thumbnail)
        .setFooter({ text: '🎵 LS Músicas • Bot Oficial' })
        .setTimestamp();

      // Botões Interativos
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause_resume').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
      );

      return interaction.followUp({ embeds: [embed], components: [buttons] });
    } catch (e) {
      console.error(e);
      return interaction.followUp({ content: "❌ Erro ao buscar/tocar a música: " + e.message });
    }
  }

  const queue = player.nodes.get(interaction.guildId);

  if (commandName === 'pause') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música tocando.');
    queue.node.pause();
    return interaction.reply('⏸️ Reprodução pausada!');
  }

  if (commandName === 'resume') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música pausada.');
    queue.node.resume();
    return interaction.reply('▶️ Reprodução retomada!');
  }

  if (commandName === 'skip') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música para pular.');
    queue.node.skip();
    return interaction.reply('⏭️ Música pulada para a próxima da fila!');
  }

  if (commandName === 'stop') {
    if (!queue) return interaction.reply('❌ O bot não está tocando no momento.');
    queue.delete();
    return interaction.reply('⏹️ Reprodução encerrada e bot desconectado!');
  }

  if (commandName === 'queue') {
    if (!queue || queue.tracks.size === 0) return interaction.reply('📋 A fila de espera está vazia.');
    const tracksList = queue.tracks.toArray().slice(0, 10).map((t, i) => (i + 1) + ". **" + t.title + "** - *" + t.author + "*").join('\n');
    return interaction.reply("📋 **Fila do LS Músicas (" + queue.tracks.size + " faixas):**\n\n" + tracksList);
  }

  if (commandName === 'nowplaying') {
    if (!queue || !queue.currentTrack) return interaction.reply('❌ Nenhuma música tocando agora.');
    const track = queue.currentTrack;
    return interaction.reply("🎶 **Tocando Agora:** **" + track.title + "** de **" + track.author + "** [" + track.duration + "]");
  }

  if (commandName === 'volume') {
    if (!queue) return interaction.reply('❌ O bot não está ativo em um canal.');
    const vol = interaction.options.getInteger('nível');
    if (vol < 0 || vol > 100) return interaction.reply('❌ Escolha um volume entre 0 e 100.');
    queue.node.setVolume(vol);
    return interaction.reply("🔊 Volume ajustado para **" + vol + "%**!");
  }

  if (commandName === 'shuffle') {
    if (!queue || queue.tracks.size < 2) return interaction.reply('❌ É preciso ter pelo menos 2 músicas na fila para embaralhar.');
    queue.tracks.shuffle();
    return interaction.reply('🔀 Fila de músicas embaralhada com sucesso!');
  }

  if (commandName === 'clear') {
    if (!queue) return interaction.reply('❌ A fila já está vazia.');
    queue.tracks.clear();
    return interaction.reply('🧹 Toda a fila de espera foi limpa!');
  }

  if (commandName === 'remove') {
    if (!queue) return interaction.reply('❌ A fila está vazia.');
    const pos = interaction.options.getInteger('posição');
    if (pos < 1 || pos > queue.tracks.size) return interaction.reply("❌ Posição inválida. Escolha entre 1 e " + queue.tracks.size + ".");
    const removed = queue.tracks.toArray()[pos - 1];
    queue.node.remove(pos - 1);
    return interaction.reply("🗑️ Música **" + removed.title + "** removida da fila!");
  }
});

// Conecta o Bot usando o Token configurado
client.login(DISCORD_TOKEN);
