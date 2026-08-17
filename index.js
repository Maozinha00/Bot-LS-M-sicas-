/**
 * LS CUSTOMS MUSIC BOT v4.0 — LS Customs (GTA RP)
 * Motor: yt-dlp-exec — Alta resistência a bloqueios
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, MessageFlags
} = require('discord.js');

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource, 
  AudioPlayerStatus, NoSubscriberBehavior, StreamType
} = require('@discordjs/voice');

const ytdlp = require('yt-dlp-exec');

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

const queues = new Map();

// --- COMANDOS SLASH ---
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música na LS Customs')
    .addStringOption(opt => opt.setName('musica').setDescription('Link ou nome da música')),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa a rádio'),
  new SlashCommandBuilder().setName('resume').setDescription('Retoma a rádio'),
  new SlashCommandBuilder().setName('skip').setDescription('Pula a música'),
  new SlashCommandBuilder().setName('stop').setDescription('Para a rádio e limpa fila'),
  new SlashCommandBuilder().setName('queue').setDescription('Exibe a fila'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('O que está tocando agora'),
  new SlashCommandBuilder().setName('loop').setDescription('Ativa/Desativa repetição'),
].map(cmd => cmd.toJSON());

// --- REGISTRO DE COMANDOS ---
client.once('ready', async () => {
  console.log(`🔧 LS CUSTOMS ON: ${client.user.tag}`);
  client.user.setActivity('🔧 Som na Garagem', { type: 2 });

  if (CLIENT_ID && TOKEN) {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Comandos Slash registrados!');
    } catch (err) {
      console.error(err);
    }
  }
});

// --- LÓGICA DE REPRODUÇÃO (CORRIGIDA) ---
async function playNext(guildId) {
  const serverQueue = queues.get(guildId);
  if (!serverQueue || serverQueue.songs.length === 0) {
    // Timer para desconectar após 1 minuto de inatividade
    setTimeout(() => {
        const check = queues.get(guildId);
        if (!check || check.songs.length === 0) {
            serverQueue?.connection?.destroy();
            queues.delete(guildId);
        }
    }, 60000);
    return;
  }

  const song = serverQueue.songs[0];

  try {
    // O segredo está aqui: usamos o exec para gerar o stream via stdout (-)
    const process = ytdlp.exec(song.url, {
      output: '-',
      format: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
      limitRate: '1M',
      rmCacheDir: true,
      quiet: true,
    }, { stdio: ['ignore', 'pipe', 'ignore'] });

    const resource = createAudioResource(process.stdout, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });

    resource.volume.setVolume(serverQueue.volume / 100);
    serverQueue.player.play(resource);
    serverQueue.connection.subscribe(serverQueue.player);

    const panel = createLSMessageEmbed(serverQueue);
    if (serverQueue.controlMessage) {
        try { await serverQueue.controlMessage.edit(panel); } catch { serverQueue.controlMessage = await serverQueue.textChannel.send(panel); }
    } else {
        serverQueue.controlMessage = await serverQueue.textChannel.send(panel);
    }

  } catch (error) {
    console.error('Erro no Stream:', error);
    serverQueue.textChannel.send(`⚠️ Erro ao tocar **${song.title}**. Pulando...`);
    serverQueue.songs.shift();
    playNext(guildId);
  }
}

// --- BUSCA YT-DLP ---
async function executePlayCommand(guild, voiceChannel, textChannel, requestedBy, queryInput) {
  let query = queryInput?.trim() || 'West Coast Hip Hop V8 LS Customs';
  let serverQueue = queues.get(guild.id);

  // Busca de metadados
  const searchResult = await ytdlp(query, {
    dumpSingleJson: true,
    defaultSearch: 'ytsearch1',
    noPlaylist: true,
    noCheckCertificates: true
  });

  const videoData = searchResult.entries ? searchResult.entries[0] : searchResult;
  
  if (!videoData) throw new Error('Música não encontrada!');

  const song = {
    title: videoData.title,
    url: videoData.webpage_url,
    duration: videoData.duration_string || '0:00',
    thumbnail: videoData.thumbnail,
    requestedBy: requestedBy
  };

  if (!serverQueue) {
    const queueConstruct = {
      textChannel,
      voiceChannel,
      connection: joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      }),
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } }),
      songs: [song],
      volume: 50,
      playing: true,
      looping: false,
      controlMessage: null
    };

    queues.set(guild.id, queueConstruct);
    queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
      if (!queueConstruct.looping) queueConstruct.songs.shift();
      playNext(guild.id);
    });

    playNext(guild.id);
    return `🔧 **LS CUSTOMS:** Soltando o som **${song.title}**!`;
  } else {
    serverQueue.songs.push(song);
    return `📋 **Adicionado à fila:** **${song.title}**`;
  }
}

// --- TEMPLATE DO EMBED ---
function createLSMessageEmbed(guildQueue) {
  const current = guildQueue.songs[0];
  if (!current) return { content: 'Fila vazia' };

  const embed = new EmbedBuilder()
    .setColor('#FFB800')
    .setTitle('🔧 LS CUSTOMS | RÁDIO DA OFICINA')
    .setDescription(`[${current.title}](${current.url})`)
    .setThumbnail(current.thumbnail)
    .addFields(
      { name: '👤 Pedido por', value: current.requestedBy, inline: true },
      { name: '⏱️ Duração', value: current.duration, inline: true },
      { name: '⚙️ Status', value: guildQueue.playing ? '▶️ Tocando' : '⏸️ Pausado', inline: true }
    )
    .setFooter({ text: 'LS Customs - O melhor tuning de Los Santos!' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_pause_resume').setEmoji(guildQueue.playing ? '⏸️' : '▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// --- TRATAMENTO DE INTERAÇÕES (SLASH & BOTÕES) ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member } = interaction;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) return interaction.reply({ content: '❌ Entre em um canal de voz!', flags: MessageFlags.Ephemeral });

        if (commandName === 'play') {
            await interaction.deferReply();
            try {
                const res = await executePlayCommand(guild, voiceChannel, interaction.channel, member.user.username, options.getString('musica'));
                await interaction.editReply(res);
            } catch (e) {
                await interaction.editReply(`❌ Erro: ${e.message}`);
            }
        }
        
        const serverQueue = queues.get(guild.id);
        if (!serverQueue) return;

        if (commandName === 'stop') {
            serverQueue.songs = [];
            serverQueue.player.stop();
            serverQueue.connection.destroy();
            queues.delete(guild.id);
            interaction.reply('⏹️ Rádio desligada!');
        }
        if (commandName === 'skip') {
            serverQueue.player.stop();
            interaction.reply('⏭️ Pulada!');
        }
    }

    if (interaction.isButton()) {
        const serverQueue = queues.get(interaction.guildId);
        if (!serverQueue) return;

        if (interaction.customId === 'btn_pause_resume') {
            if (serverQueue.playing) serverQueue.player.pause();
            else serverQueue.player.unpause();
            serverQueue.playing = !serverQueue.playing;
            await interaction.update(createLSMessageEmbed(serverQueue));
        }
        if (interaction.customId === 'btn_skip') {
            serverQueue.player.stop();
            await interaction.reply({ content: '⏭️ Música pulada!', flags: MessageFlags.Ephemeral });
        }
        if (interaction.customId === 'btn_stop') {
            serverQueue.songs = [];
            serverQueue.player.stop();
            serverQueue.connection.destroy();
            queues.delete(interaction.guildId);
            await interaction.reply({ content: '⏹️ Bot desconectado!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(TOKEN);
