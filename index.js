// ============================================================
// 🎵 LS MÚSICAS — BOT DE MÚSICA PARA DISCORD (discord.js v14)
// ============================================================

require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  REST, 
  Routes, 
  SlashCommandBuilder 
} = require('discord.js');
const { Player, QueryType } = require('discord-player');
const { GoogleGenAI } = require('@google/genai');

// Inicialização do Cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Inicialização do Player de Áudio
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
  },
});

// Inicialização do Gemini AI
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// ============================================================
// REGISTRO DOS COMANDOS SLASH (/)
// ============================================================
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música por nome ou link')
    .addStringOption(opt => opt.setName('música').setDescription('Nome ou URL da música').setRequired(true)),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa a música atual'),
  new SlashCommandBuilder().setName('resume').setDescription('Retoma a reprodução da música'),
  new SlashCommandBuilder().setName('skip').setDescription('Pula para a próxima música'),
  new SlashCommandBuilder().setName('stop').setDescription('Para a música e sai do canal de voz'),
  new SlashCommandBuilder().setName('queue').setDescription('Exibe a fila de músicas atual'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Mostra a música tocando agora'),
  new SlashCommandBuilder().setName('loop').setDescription('Alterna o modo de repetição'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Altera o volume do bot')
    .addIntegerOption(opt => opt.setName('nível').setDescription('Volume de 0 a 100').setRequired(true)),
  new SlashCommandBuilder().setName('shuffle').setDescription('Embaralha a fila de músicas'),
  new SlashCommandBuilder().setName('clear').setDescription('Limpa toda a fila de espera'),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove uma música da fila pelo número')
    .addIntegerOption(opt => opt.setName('posição').setDescription('Número da posição na fila').setRequired(true)),
  new SlashCommandBuilder()
    .setName('aidj')
    .setDescription('Gera um anúncio interativo do DJ usando Inteligência Artificial')
    .addStringOption(opt => opt.setName('vibe').setDescription('Estilo do anúncio (Ex: Festa, Carioca, Rádio FM)')),
  new SlashCommandBuilder().setName('lyrics').setDescription('Busca a letra completa da música atual'),
].map(cmd => cmd.toJSON());

// ============================================================
// EVENTO READY & REGISTRO GLOBAL DE COMANDOS
// ============================================================
client.once('ready', async () => {
  console.log(`\n🎵 LS Músicas está ONLINE como: ${client.user.tag}`);
  client.user.setActivity('🎵 LS Músicas | /play', { type: 2 });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('🔄 Registrando comandos Slash no Discord...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID || client.user.id),
      { body: commands }
    );
    console.log('✅ Comandos Slash registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
});

// ============================================================
// PAINEL DE CONTROLE DE ÁUDIO COM BOTÕES INTERATIVOS
// ============================================================
function createMusicEmbed(track, user, queueLength = 0, status = 'Playing') {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎵 LS MÚSICAS — PAINEL INTERATIVO')
    .setDescription(`🎶 **Tocando agora:** [${track.title}](${track.url})\n👤 **Pedido por:** ${user.username}`)
    .addFields(
      { name: '⏱️ Duração', value: track.duration || '03:30', inline: true },
      { name: '📋 Fila', value: `${queueLength} músicas`, inline: true },
      { name: '🔊 Volume', value: '80%', inline: true }
    )
    .setThumbnail(track.thumbnail)
    .setFooter({ text: 'LS Músicas Bot • Digite /play para adicionar mais' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️ Pausar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_resume').setLabel('▶️ Continuar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Pular').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Parar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_queue').setLabel('📋 Ver Fila').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ============================================================
// TRATAMENTO DOS COMANDOS SLASH
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guild, channel } = interaction;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel && ['play', 'pause', 'resume', 'skip', 'stop', 'volume'].includes(commandName)) {
      return interaction.reply({ content: '❌ Você precisa estar em um canal de voz!', ephemeral: true });
    }

    // 🎵 /play
    if (commandName === 'play') {
      await interaction.deferReply();
      const query = interaction.options.getString('música');

      try {
        const searchResult = await player.search(query, {
          requestedBy: interaction.user,
          searchEngine: QueryType.AUTO,
        });

        if (!searchResult || !searchResult.tracks.length) {
          return interaction.followUp('❌ Nenhum resultado encontrado para sua busca!');
        }

        const queue = player.nodes.create(guild, {
          metadata: channel,
          selfDeaf: true,
          leaveOnEnd: false,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000, // 5 min
        });

        if (!queue.connection) await queue.connect(voiceChannel);

        const track = searchResult.tracks[0];
        queue.addTrack(track);

        if (!queue.isPlaying()) await queue.node.play();

        return interaction.followUp(
          createMusicEmbed(track, interaction.user, queue.tracks.size)
        );
      } catch (err) {
        console.error(err);
        return interaction.followUp('❌ Ocorreu um erro ao tentar tocar a música.');
      }
    }

    // ⏸️ /pause
    if (commandName === 'pause') {
      const queue = player.nodes.get(guild);
      if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música tocando.');
      queue.node.pause();
      return interaction.reply('⏸️ Música pausada!');
    }

    // ▶️ /resume
    if (commandName === 'resume') {
      const queue = player.nodes.get(guild);
      if (!queue) return interaction.reply('❌ Nenhuma música em espera.');
      queue.node.resume();
      return interaction.reply('▶️ Reprodução retomada!');
    }

    // ⏭️ /skip
    if (commandName === 'skip') {
      const queue = player.nodes.get(guild);
      if (!queue || !queue.isPlaying()) return interaction.reply('❌ Nenhuma música tocando.');
      queue.node.skip();
      return interaction.reply('⏭️ Música pulada!');
    }

    // ⏹️ /stop
    if (commandName === 'stop') {
      const queue = player.nodes.get(guild);
      if (queue) queue.delete();
      return interaction.reply('⏹️ Parado e desconectado do canal de voz!');
    }

    // 📋 /queue
    if (commandName === 'queue') {
      const queue = player.nodes.get(guild);
      if (!queue || queue.tracks.size === 0) return interaction.reply('📋 A fila está vazia.');

      const tracksList = queue.tracks.toArray().slice(0, 10).map((t, idx) => `${idx + 1}. **${t.title}** - ${t.author}`).join('\n');
      return interaction.reply(`📋 **Fila de Espera (${queue.tracks.size} músicas):**\n\n${tracksList}`);
    }

    // 🔊 /volume
    if (commandName === 'volume') {
      const vol = interaction.options.getInteger('nível');
      const queue = player.nodes.get(guild);
      if (queue) queue.node.setVolume(vol);
      return interaction.reply(`🔊 Volume ajustado para **${vol}%**`);
    }

    // 🎙️ /aidj (Gemini AI DJ)
    if (commandName === 'aidj') {
      await interaction.deferReply();
      const vibe = interaction.options.getString('vibe') || 'Festa Animada';
      const queue = player.nodes.get(guild);
      const current = queue?.currentTrack;

      if (!ai) {
        return interaction.followUp('🎵 **LS DJ:** Solta o som galera do server! Toca a braba!');
      }

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `Você é o "LS Músicas", o bot DJ mais animado do Discord!
Crie uma fala curta (1-2 frases) estilo locutor de rádio ou DJ anunciando a música "${current?.title || 'a próxima música'}" para a galera do servidor com estilo "${vibe}". Use emojis!`,
        });

        return interaction.followUp(`🎙️ **Anúncio do LS DJ:**\n> ${response.text}`);
      } catch {
        return interaction.followUp('🎵 **LS DJ:** Solta o som galera do server!');
      }
    }
  }

  // 🎛️ TRATAMENTO DOS BOTÕES DO PAINEL
  if (interaction.isButton()) {
    const queue = player.nodes.get(interaction.guild);

    if (interaction.customId === 'btn_pause') {
      queue?.node.pause();
      return interaction.reply({ content: '⏸️ Pausado!', ephemeral: true });
    }
    if (interaction.customId === 'btn_resume') {
      queue?.node.resume();
      return interaction.reply({ content: '▶️ Retomado!', ephemeral: true });
    }
    if (interaction.customId === 'btn_skip') {
      queue?.node.skip();
      return interaction.reply({ content: '⏭️ Pulado!', ephemeral: true });
    }
    if (interaction.customId === 'btn_stop') {
      queue?.delete();
      return interaction.reply({ content: '⏹️ Parado!', ephemeral: true });
    }
  }
});

// Login do Bot
client.login(process.env.DISCORD_BOT_TOKEN);
