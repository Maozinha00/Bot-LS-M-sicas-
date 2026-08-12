/**
 * LS CUSTOMS MUSIC BOT v3.0 (SUPER ROBUSTO)
 * Bot de Música para Discord - Servidor LS CUSTOMS (GTA RP)
 * Suporta Comandos Slash (/) e Comandos de Texto (!play, !p, ls!play)
 * Compatível com Node.js 20+ e Hospedagem no Railway / Render / VPS
 */

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const yts = require('yt-search');

// Token & Client Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Cache da Fila por Servidor (Guild ID -> Data)
const queues = new Map();

// REGISTRO DOS COMANDOS SLASH
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música do YouTube no canal de voz da LS Customs')
    .addStringOption(option =>
      option.setName('musica')
        .setDescription('Nome da música, artista ou link do YouTube')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa a reprodução da rádio da oficina'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Retoma a música pausada'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pula para a próxima música da fila'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Para a rádio e limpa toda a fila da oficina'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Exibe a fila de músicas atual'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Mostra detalhes da música que está tocando agora'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume do alto-falante (1 - 100)')
    .addIntegerOption(option =>
      option.setName('nivel')
        .setDescription('Volume de 1 a 100')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Ativa/Desativa repetição da música atual'),

  new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Embaralha a fila de músicas da garagem')
].map(cmd => cmd.toJSON());

// REGISTRAR COMANDOS AO INICIAR
const onReadyHandler = async () => {
  console.log("🔧 LS CUSTOMS MUSIC BOT ON! Logado como " + client.user.tag);
  try {
    client.user.setActivity('🔧 Som na Garagem | /play ou !play', { type: 2 });
  } catch (e) {}

  if (CLIENT_ID && TOKEN) {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
      console.log('🔄 Registrando comandos Slash (/)...');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Comandos Slash registrados com sucesso!');
    } catch (err) {
      console.error('❌ Erro ao registrar comandos:', err);
    }
  }
};

client.once('ready', onReadyHandler);
client.once('clientReady', onReadyHandler);

// CRIAR EMBED COM PAINEL DE BOTÕES TEMÁTICO LS CUSTOMS
function createLSMessageEmbed(guildQueue) {
  const current = guildQueue.songs[0];
  if (!current) return null;

  const statusEmoji = guildQueue.playing ? '▶️ Tocando' : '⏸️ Pausado';
  const loopEmoji = guildQueue.looping ? '🔁 Ligado' : '➡️ Desligado';
  const pendingSongs = guildQueue.songs.length > 1 ? (guildQueue.songs.length - 1) : 0;

  const embed = new EmbedBuilder()
    .setColor('#FFB800')
    .setTitle('🔧 LS CUSTOMS | RÁDIO DA OFICINA')
    .setDescription("[ " + current.title + " ](" + current.url + ")")
    .setThumbnail(current.thumbnail || 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=400&q=80')
    .addFields(
      { name: '👤 Solicitado por', value: String(current.requestedBy), inline: true },
      { name: '⏱️ Duração', value: String(current.duration), inline: true },
      { name: '🔊 Volume', value: guildQueue.volume + '%', inline: true },
      { name: '⚙️ Status', value: statusEmoji, inline: true },
      { name: '🔁 Loop', value: loopEmoji, inline: true },
      { name: '📋 Na Fila', value: pendingSongs + ' música(s)', inline: true }
    )
    .setFooter({ text: 'LS Customs - O melhor tuning e som de Los Santos! 🛠️' })
    .setTimestamp();

  // Linha de Botões de Controle
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_pause_resume').setEmoji(guildQueue.playing ? '⏸️' : '▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_loop').setEmoji('🔁').setStyle(guildQueue.looping ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_queue').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// TOCAR MÚSICA DA FILA
async function playNext(guildId) {
  const serverQueue = queues.get(guildId);

  if (!serverQueue || serverQueue.songs.length === 0) {
    if (serverQueue && serverQueue.connection) {
      setTimeout(() => {
        const checkQueue = queues.get(guildId);
        if (!checkQueue || checkQueue.songs.length === 0) {
          try { serverQueue.connection.destroy(); } catch (e) {}
          queues.delete(guildId);
          serverQueue.textChannel.send('🚗 **[LS CUSTOMS]**: Fila vazia! Rádio desligada para economizar bateria da garagem.');
        }
      }, 60000);
    }
    return;
  }

  const song = serverQueue.songs[0];

  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
    resource.volume.setVolume(serverQueue.volume / 100);

    serverQueue.player.play(resource);
    serverQueue.connection.subscribe(serverQueue.player);

    const panel = createLSMessageEmbed(serverQueue);
    if (panel) {
      serverQueue.controlMessage = await serverQueue.textChannel.send(panel);
    }
  } catch (error) {
    console.error('Erro ao carregar stream:', error);
    serverQueue.textChannel.send('⚠️ Erro ao carregar stream de **' + song.title + '**. Pulando para a próxima...');
    serverQueue.songs.shift();
    playNext(guildId);
  }
}

// FUNÇÃO CORE DE ADICIONAR/TOCAR MÚSICA
async function executePlayCommand(guild, voiceChannel, textChannel, requestedBy, queryInput) {
  let query = (queryInput || '').trim();
  let defaultUsed = false;

  if (!query) {
    query = "West Coast Hip Hop V8 LS Customs";
    defaultUsed = true;
  }

  let serverQueue = queues.get(guild.id);

  let videoUrl = query;
  let videoTitle = query;
  let videoDuration = '3:30';
  let videoThumb = 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=400&q=80';

  const searchResult = await yts(query);

  if (searchResult && searchResult.videos && searchResult.videos.length > 0) {
    const topVideo = searchResult.videos[0];
    videoTitle = topVideo.title;
    videoUrl = topVideo.url;
    videoDuration = topVideo.timestamp || '3:30';
    videoThumb = topVideo.thumbnail || videoThumb;
  } else if (query.startsWith('http://') || query.startsWith('https://')) {
    videoUrl = query;
    videoTitle = 'Música do YouTube';
  } else {
    throw new Error('Nenhuma música encontrada para: ' + query);
  }

  const song = {
    title: videoTitle,
    url: videoUrl,
    duration: videoDuration,
    thumbnail: videoThumb,
    requestedBy: requestedBy || 'Mecânico'
  };

  if (!serverQueue) {
    const queueConstruct = {
      textChannel: textChannel,
      voiceChannel: voiceChannel,
      connection: null,
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } }),
      songs: [song],
      volume: 50,
      playing: true,
      looping: false,
      controlMessage: null
    };

    queues.set(guild.id, queueConstruct);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    queueConstruct.connection = connection;

    queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
      if (!queueConstruct.looping) {
        queueConstruct.songs.shift();
      }
      playNext(guild.id);
    });

    playNext(guild.id);
    const defaultNotice = defaultUsed ? " *(Música padrão tocada porque nenhum nome/link foi informado)*" : "";
    return '🔧 **Tocando na rádio:** **' + song.title + '**!' + defaultNotice;
  } else {
    serverQueue.songs.push(song);
    return '📋 **Adicionado à fila da LS Customs:** **' + song.title + '** (Posição #' + serverQueue.songs.length + ')';
  }
}

// 1. PROCESSAR COMANDOS SLASH (/)
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild, member } = interaction;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel && ['play', 'pause', 'resume', 'skip', 'stop', 'volume', 'loop', 'shuffle'].includes(commandName)) {
      return interaction.reply({ content: '❌ **Você precisa estar em um canal de voz** da LS Customs para controlar a rádio!', ephemeral: true });
    }

    let serverQueue = queues.get(guild.id);

    // /PLAY
    if (commandName === 'play') {
      await interaction.deferReply();

      let rawQuery = options.getString('musica') || options.getString('query') || options.getString('song');
      if (!rawQuery && interaction.options && interaction.options.data && interaction.options.data.length > 0) {
        rawQuery = String(interaction.options.data[0].value || '');
      }

      try {
        const msg = await executePlayCommand(guild, voiceChannel, interaction.channel, member.user.username, rawQuery);
        await interaction.editReply(msg);
      } catch (err) {
        console.error("Erro /play:", err);
        await interaction.editReply('⚠️ Ocorreu um erro ao buscar no YouTube: ' + err.message);
      }
    }

    // /PAUSE
    else if (commandName === 'pause') {
      if (!serverQueue || !serverQueue.playing) return interaction.reply({ content: '⚠️ A rádio já está pausada!', ephemeral: true });
      serverQueue.player.pause();
      serverQueue.playing = false;
      interaction.reply('⏸️ **Rádio da LS Customs Pausada!**');
    }

    // /RESUME
    else if (commandName === 'resume') {
      if (!serverQueue || serverQueue.playing) return interaction.reply({ content: '⚠️ A rádio já está tocando!', ephemeral: true });
      serverQueue.player.unpause();
      serverQueue.playing = true;
      interaction.reply('▶️ **Rádio Retomada! Solta o ronco do V8!**');
    }

    // /SKIP
    else if (commandName === 'skip') {
      if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply({ content: '⚠️ Não há músicas na fila para pular!', ephemeral: true });
      serverQueue.player.stop();
      interaction.reply('⏭️ **Música pulada com sucesso!**');
    }

    // /STOP
    else if (commandName === 'stop') {
      if (!serverQueue) return interaction.reply({ content: '⚠️ Nenhuma música está tocando!', ephemeral: true });
      serverQueue.songs = [];
      serverQueue.player.stop();
      if (serverQueue.connection) { try { serverQueue.connection.destroy(); } catch (e) {} }
      queues.delete(guild.id);
      interaction.reply('⏹️ **Rádio desligada e fila limpa por completo!**');
    }

    // /QUEUE
    else if (commandName === 'queue') {
      if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('📋 A fila da oficina está vazia no momento.');
      const list = serverQueue.songs.slice(0, 10).map((s, i) => (i === 0 ? '▶️ **Tocando Agora:** ' : '#' + i + ' ') + s.title + ' (pedida por ' + s.requestedBy + ')').join('\n');
      interaction.reply('📋 **FILA DA GARAGEM LS CUSTOMS:**\n\n' + list);
    }

    // /VOLUME
    else if (commandName === 'volume') {
      const vol = options.getInteger('nivel');
      if (!serverQueue) return interaction.reply({ content: '⚠️ Nenhuma música tocando para alterar o volume!', ephemeral: true });
      serverQueue.volume = vol;
      interaction.reply('🔊 **Volume da rádio ajustado para ' + vol + '%**');
    }

    // /LOOP
    else if (commandName === 'loop') {
      if (!serverQueue) return interaction.reply({ content: '⚠️ Nenhuma música tocando!', ephemeral: true });
      serverQueue.looping = !serverQueue.looping;
      interaction.reply('🔁 **Repetição da música ' + (serverQueue.looping ? 'ATIVADA' : 'DESATIVADA') + '!**');
    }

    // /SHUFFLE
    else if (commandName === 'shuffle') {
      if (!serverQueue || serverQueue.songs.length <= 1) return interaction.reply('⚠️ Poucas músicas na fila para embaralhar!');
      const current = serverQueue.songs.shift();
      serverQueue.songs.sort(() => Math.random() - 0.5);
      serverQueue.songs.unshift(current);
      interaction.reply('🔀 **Fila da oficina embaralhada com sucesso!**');
    }
  }

  // EVENTOS DE BOTÕES DO PAINEL DISCORD
  if (interaction.isButton()) {
    const { customId, guild } = interaction;
    const serverQueue = queues.get(guild.id);

    if (!serverQueue) {
      return interaction.reply({ content: '⚠️ Fila inativa. Digite `/play` para iniciar!', ephemeral: true });
    }

    if (customId === 'btn_pause_resume') {
      if (serverQueue.playing) {
        serverQueue.player.pause();
        serverQueue.playing = false;
      } else {
        serverQueue.player.unpause();
        serverQueue.playing = true;
      }
      await interaction.update(createLSMessageEmbed(serverQueue));
    } else if (customId === 'btn_skip') {
      serverQueue.player.stop();
      await interaction.reply({ content: '⏭️ Música pulada!', ephemeral: true });
    } else if (customId === 'btn_loop') {
      serverQueue.looping = !serverQueue.looping;
      await interaction.update(createLSMessageEmbed(serverQueue));
    } else if (customId === 'btn_queue') {
      const list = serverQueue.songs.slice(0, 10).map((s, i) => (i === 0 ? '▶️ ' : '#' + i + ' ') + s.title).join('\n');
      await interaction.reply({ content: '📋 **Fila Atual:**\n' + list, ephemeral: true });
    } else if (customId === 'btn_stop') {
      serverQueue.songs = [];
      serverQueue.player.stop();
      if (serverQueue.connection) { try { serverQueue.connection.destroy(); } catch (e) {} }
      queues.delete(guild.id);
      await interaction.reply({ content: '⏹️ Bot desconectado e fila limpa!', ephemeral: true });
    }
  }
});

// 2. PROCESSAR COMANDOS DE TEXTO TRADICIONAIS (!play, !p, ls!play)
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const prefixes = ['!', 'ls!', 'p!'];
  const prefix = prefixes.find(p => message.content.toLowerCase().startsWith(p));
  if (!prefix) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (['play', 'p'].includes(cmd)) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ **Você precisa estar em um canal de voz** da LS Customs para tocar música!');
    }

    const query = args.join(' ');
    const loadingMsg = await message.reply('🔎 **LS CUSTOMS**: Buscando no YouTube...');

    try {
      const result = await executePlayCommand(message.guild, voiceChannel, message.channel, message.author.username, query);
      await loadingMsg.edit(result);
    } catch (err) {
      console.error('Erro no comando de texto !play:', err);
      await loadingMsg.edit('⚠️ Erro ao buscar música no YouTube: ' + err.message);
    }
  } else if (['skip', 'next', 's'].includes(cmd)) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue || serverQueue.songs.length === 0) return message.reply('⚠️ Fila vazia!');
    serverQueue.player.stop();
    message.reply('⏭️ Música pulada!');
  } else if (['stop', 'leave'].includes(cmd)) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) return message.reply('⚠️ Nenhuma rádio ativa.');
    serverQueue.songs = [];
    serverQueue.player.stop();
    if (serverQueue.connection) { try { serverQueue.connection.destroy(); } catch (e) {} }
    queues.delete(message.guild.id);
    message.reply('⏹️ Rádio desligada e fila limpa!');
  }
});

// DESCONECTAR SE FICAR SOZINHO NO CANAL DE VOZ
client.on('voiceStateUpdate', (oldState, newState) => {
  const guildId = oldState.guild.id;
  const serverQueue = queues.get(guildId);

  if (serverQueue && serverQueue.voiceChannel) {
    const membersInVc = serverQueue.voiceChannel.members.filter(m => !m.user.bot);
    if (membersInVc.size === 0) {
      setTimeout(() => {
        const recheck = queues.get(guildId);
        if (recheck && recheck.voiceChannel) {
          const currentMembers = recheck.voiceChannel.members.filter(m => !m.user.bot);
          if (currentMembers.size === 0) {
            try { recheck.connection?.destroy(); } catch (e) {}
            queues.delete(guildId);
            recheck.textChannel?.send('🚪 **[LS CUSTOMS]**: Canal de voz vazio! Bot desconectado automaticamente.');
          }
        }
      }, 30000);
    }
  }
});

// LOGIN NO DISCORD
if (!TOKEN) {
  console.error('❌ ERRO: VARIÁVEL DISCORD_TOKEN NÃO CONFIGURADA NO .ENV!');
} else {
  client.login(TOKEN);
}
