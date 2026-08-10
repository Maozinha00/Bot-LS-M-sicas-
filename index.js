// =========================================================================
// 🎵 LS MÚSICAS — BOT DE MÚSICA COMPLETO PARA DISCORD (index.js)
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
const { DefaultExtractors } = require('@discord-player/extractor');

// 🔑 CONFIGURAÇÃO DO TOKEN E SERVIDOR
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "SEU_TOKEN_DO_BOT_AQUI";
const GUILD_ID = process.env.GUILD_ID || "1535806745816072245";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Inicializa o Player
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  }
});

// 🚀 REGISTRO DOS COMANDOS SLASH
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música por nome ou link')
    .addStringOption(option =>
      option.setName('música')
        .setDescription('Nome ou link da música')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa a música atual'),
  new SlashCommandBuilder().setName('resume').setDescription('Continua a reprodução'),
  new SlashCommandBuilder().setName('skip').setDescription('Pula a música'),
  new SlashCommandBuilder().setName('stop').setDescription('Para e sai do canal'),
  new SlashCommandBuilder().setName('queue').setDescription('Exibe a fila de músicas'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Música atual'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume (0 a 100%)')
    .addIntegerOption(option =>
      option.setName('nível')
        .setDescription('Volume (0 a 100)')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('shuffle').setDescription('Embaralha a fila'),
  new SlashCommandBuilder().setName('clear').setDescription('Limpa a fila'),
].map(command => command.toJSON());

client.once('ready', async () => {
  // 🔍 CARREGA OS EXTRATORES (YouTube, Spotify, etc.)
  try {
    await player.extractors.loadDefault();
    console.log('✅ Extratores de música carregados com sucesso!');
  } catch (err) {
    console.log('⚠️ Erro ao carregar extratores:', err.message);
  }

  console.log(`\n==================================================`);
  console.log(`🎵 LS Músicas online como ${client.user.tag}!`);
  console.log(`Servidor Alvo: ${GUILD_ID}`);
  console.log(`==================================================\n`);

  client.user.setActivity('🎵 LS Músicas | /play', { type: 2 });

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandos Slash registrados!');
  } catch (error) {
    console.error('❌ Erro nos comandos:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const memberVoiceChannel = interaction.member?.voice?.channel;

  if (interaction.isButton()) {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ Nenhuma música tocando!', ephemeral: true });
    }

    switch (interaction.customId) {
      case 'btn_pause_resume':
        queue.node.pause() ? queue.node.resume() : queue.node.pause();
        return interaction.reply({ content: queue.node.isPaused() ? '⏸️ Pausado!' : '▶️ Retomado!', ephemeral: true });
      case 'btn_skip':
        queue.node.skip();
        return interaction.reply({ content: '⏭️ Música pulada!', ephemeral: true });
      case 'btn_stop':
        queue.delete();
        return interaction.reply({ content: '⏹️ Bot desconectado!', ephemeral: true });
      case 'btn_queue':
        const tracks = queue.tracks.toArray().map((t, i) => `${i + 1}. **${t.title}**`).join('\n');
        return interaction.reply({ content: `📋 **Fila:**\n${tracks || 'Fila vazia!'}`, ephemeral: true });
    }
  }

  const { commandName } = interaction;

  if (commandName === 'play') {
    if (!memberVoiceChannel) {
      return interaction.reply({ content: '❌ Entre em um canal de voz primeiro!', ephemeral: true });
    }

    const query = interaction.options.getString('música');
    await interaction.deferReply();

    try {
      // 🎯 BUSCA COM SEARCH ENGINE AUTO/YOUTUBE
      const { track } = await player.play(memberVoiceChannel, query, {
        searchEngine: QueryType.AUTO, // Garante que pesquisas por texto como "mc mn" funcionem!
        nodeOptions: {
          metadata: interaction.channel,
          volume: 80,
          bufferingTimeout: 3000,
          leaveOnEnd: false,
          leaveOnEmpty: true,
        }
      });

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎵 LS MÚSICAS — Adicionada à Fila')
        .setDescription(`🎶 **[${track.title}](${track.url})**\n👤 Artista: **${track.author}**`)
        .addFields(
          { name: '👤 Pedido por', value: `${interaction.user}`, inline: true },
          { name: '⏱️ Duração', value: `${track.duration}`, inline: true },
          { name: '🔊 Volume', value: '80%', inline: true }
        )
        .setThumbnail(track.thumbnail)
        .setFooter({ text: '🎵 LS Músicas • Bot Oficial' })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause_resume').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
      );

      return interaction.followUp({ embeds: [embed], components: [buttons] });
    } catch (e) {
      console.error(e);
      return interaction.followUp({ content: `❌ Erro ao buscar/tocar a música: ${e.message}` });
    }
  }

  const queue = player.nodes.get(interaction.guildId);

  if (commandName === 'pause') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música tocando.');
    queue.node.pause();
    return interaction.reply('⏸️ Pausado!');
  }

  if (commandName === 'resume') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música pausada.');
    queue.node.resume();
    return interaction.reply('▶️ Retomado!');
  }

  if (commandName === 'skip') {
    if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música para pular.');
    queue.node.skip();
    return interaction.reply('⏭️ Pulado!');
  }

  if (commandName === 'stop') {
    if (!queue) return interaction.reply('❌ Bot não está tocando.');
    queue.delete();
    return interaction.reply('⏹️ Parado e desconectado!');
  }

  if (commandName === 'queue') {
    if (!queue || queue.tracks.size === 0) return interaction.reply('📋 Fila vazia.');
    const tracksList = queue.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n');
    return interaction.reply(`📋 **Fila (${queue.tracks.size}):**\n\n${tracksList}`);
  }

  if (commandName === 'nowplaying') {
    if (!queue || !queue.currentTrack) return interaction.reply('❌ Nenhuma música tocando.');
    const track = queue.currentTrack;
    return interaction.reply(`🎶 **Tocando Agora:** **${track.title}** [${track.duration}]`);
  }

  if (commandName === 'volume') {
    if (!queue) return interaction.reply('❌ Bot inativo.');
    const vol = interaction.options.getInteger('nível');
    if (vol < 0 || vol > 100) return interaction.reply('❌ Volume entre 0 e 100.');
    queue.node.setVolume(vol);
    return interaction.reply(`🔊 Volume: **${vol}%**`);
  }

  if (commandName === 'shuffle') {
    if (!queue || queue.tracks.size < 2) return interaction.reply('❌ Mínimo 2 músicas para embaralhar.');
    queue.tracks.shuffle();
    return interaction.reply('🔀 Fila embaralhada!');
  }

  if (commandName === 'clear') {
    if (!queue) return interaction.reply('❌ Fila vazia.');
    queue.tracks.clear();
    return interaction.reply('🧹 Fila limpa!');
  }
});

client.login(DISCORD_TOKEN);
