/**
 * LS MÚSICAS - Bot Discord estilo Jockie Music
 * Desenvolvido para hospedagem no Railway com Node.js 20.x
 *
 * Funcionalidades:
 * - Comandos Slash (/play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /volume, /shuffle, /clear, /remove, /loop)
 * - Painel de Botões Interativo no embed Now Playing estilo Jockie Music
 * - Auto-desconexão quando o canal de voz estiver vazio
 * - Suporte a pesquisa por nome e links (YouTube / Spotify / SoundCloud)
 * - Registro automático de Slash Commands na guild configurada
 */

// Pre-carrega dependências de áudio nativas para evitar fallback legado
try {
  require('@discordjs/voice');
  require('libsodium-wrappers');
} catch (e) {}

const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ComponentType 
} = require('discord.js');
const { Player, QueryType, QueueRepeatMode } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

// Carrega variáveis de ambiente
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

if (!TOKEN) {
  console.error('❌ ERRO CRÍTICO: DISCORD_TOKEN não foi configurado nas variáveis de ambiente!');
  process.exit(1);
}

// Inicializa o Client do Discord com as intenções necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Inicializa o Discord Player para gerenciamento de áudio
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
    filter: 'audioonly',
    liveBuffer: 60000,
    dlChunkSize: 0
  }
});

// Registra os extratores padrão (YouTube, Spotify, SoundCloud, Apple Music)
async function setupPlayer() {
  try {
    await player.extractors.loadMulti(DefaultExtractors);
    console.log('✅ Extratores de música carregados com sucesso.');
  } catch (err) {
    console.warn('⚠️ Aviso no carregamento dos extratores:', err.message);
  }
}

// Definição dos Comandos Slash no Estilo Jockie Music
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música ou playlist do YouTube/Spotify')
    .addStringOption(option => 
      option.setName('busca')
        .setDescription('Nome da música, artista ou link da playlist')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa a reprodução da música atual'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Retoma a reprodução da música pausada'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pula a música atual'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Para a música, limpa a fila e sai do canal de voz'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Exibe a fila de músicas atual'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Exibe detalhes e o painel de controles da música atual'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume do bot (0 a 100)')
    .addIntegerOption(option =>
      option.setName('nivel')
        .setDescription('Volume de 0 a 100')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Embaralha a ordem das músicas na fila'),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Esvazia todas as músicas da fila (exceto a atual)'),

  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Alterna o modo de repetição (Desativado / Música / Fila)')
    .addStringOption(option =>
      option.setName('modo')
        .setDescription('Modo de repetição')
        .setRequired(true)
        .addChoices(
          { name: 'Desativado', value: 'off' },
          { name: 'Repetir Música Atual', value: 'track' },
          { name: 'Repetir Fila Inteira', value: 'queue' }
        )
    ),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove uma música específica da fila pelo número')
    .addIntegerOption(option =>
      option.setName('numero')
        .setDescription('Posição da música na fila')
        .setRequired(true)
        .setMinValue(1)
    )
].map(command => command.toJSON());

// Criação do Painel Interativo de Botões do Jockie Music
function createControlButtons(queue) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_pause_resume')
      .setEmoji(queue.node.isPaused() ? '▶️' : '⏸️')
      .setStyle(queue.node.isPaused() ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('btn_shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_loop')
      .setEmoji(queue.repeatMode === QueueRepeatMode.TRACK ? '🔂' : queue.repeatMode === QueueRepeatMode.QUEUE ? '🔁' : '➡️')
      .setStyle(queue.repeatMode !== QueueRepeatMode.OFF ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_vol_down')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_vol_up')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_queue')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_clear')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

// Constrói o Embed Estilo Jockie Music para Now Playing
function createNowPlayingEmbed(track, queue) {
  const currentVolume = queue.node.volume;
  const loopStatus = queue.repeatMode === QueueRepeatMode.TRACK 
    ? '🔂 Música' 
    : queue.repeatMode === QueueRepeatMode.QUEUE 
    ? '🔁 Fila' 
    : '❌ Desativado';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ 
      name: '🎵 LS MÚSICAS — Tocando Agora', 
      iconURL: client.user.displayAvatarURL() 
    })
    .setTitle(track.title)
    .setURL(track.url)
    .setDescription(`**Artista/Canal:** ${track.author}\n**Duração:** \`${track.duration}\` | **Adicionado por:** ${track.requestedBy}`)
    .addFields(
      { name: '🔊 Volume', value: `${currentVolume}%`, inline: true },
      { name: '🔁 Loop', value: `${loopStatus}`, inline: true },
      { name: '📋 Fila', value: `${queue.tracks.size} músicas pendentes`, inline: true }
    )
    .setThumbnail(track.thumbnail || client.user.displayAvatarURL())
    .setFooter({ text: 'LS Músicas • Estilo Jockie Music • Sistema de Alta Qualidade', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

// Eventos do Player do Discord
player.events.on('playerStart', (queue, track) => {
  const embed = createNowPlayingEmbed(track, queue);
  const components = createControlButtons(queue);

  if (queue.metadata && queue.metadata.channel) {
    queue.metadata.channel.send({
      embeds: [embed],
      components: components
    }).then(msg => {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: track.durationMS > 0 ? track.durationMS : 300000
      });

      collector.on('collect', async (interaction) => {
        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== queue.channel.id) {
          return interaction.reply({ content: '❌ Você precisa estar no mesmo canal de voz que o bot para usar os controles!', ephemeral: true });
        }

        await interaction.deferUpdate();

        switch (interaction.customId) {
          case 'btn_pause_resume':
            queue.node.togglePause();
            break;

          case 'btn_skip':
            queue.node.skip();
            interaction.followUp({ content: '⏭️ Música pulada com sucesso!', ephemeral: true });
            break;

          case 'btn_stop':
            queue.delete();
            interaction.followUp({ content: '⏹️ Reprodução parada e fila limpa!', ephemeral: true });
            break;

          case 'btn_shuffle':
            queue.tracks.shuffle();
            interaction.followUp({ content: '🔀 Fila embaralhada!', ephemeral: true });
            break;

          case 'btn_loop':
            const nextMode = queue.repeatMode === QueueRepeatMode.OFF 
              ? QueueRepeatMode.TRACK 
              : queue.repeatMode === QueueRepeatMode.TRACK 
              ? QueueRepeatMode.QUEUE 
              : QueueRepeatMode.OFF;
            queue.setRepeatMode(nextMode);
            interaction.followUp({ content: `🔁 Modo de repetição alterado!`, ephemeral: true });
            break;

          case 'btn_vol_down':
            const newVolDown = Math.max(0, queue.node.volume - 10);
            queue.node.setVolume(newVolDown);
            break;

          case 'btn_vol_up':
            const newVolUp = Math.min(100, queue.node.volume + 10);
            queue.node.setVolume(newVolUp);
            break;

          case 'btn_queue':
            const queueList = queue.tracks.toArray().slice(0, 10).map((t, i) => `**${i + 1}.** [${t.title}](${t.url}) - \`${t.duration}\``).join('\n') || 'Nenhuma outra música na fila.';
            interaction.followUp({
              embeds: [
                new EmbedBuilder()
                  .setColor('#5865F2')
                  .setTitle('📋 Fila de Músicas — LS MÚSICAS')
                  .setDescription(queueList)
                  .setFooter({ text: `Total: ${queue.tracks.size} músicas na fila` })
              ],
              ephemeral: true
            });
            break;

          case 'btn_clear':
            queue.tracks.clear();
            interaction.followUp({ content: '🗑️ Fila limpa com sucesso!', ephemeral: true });
            break;
        }

        try {
          const updatedEmbed = createNowPlayingEmbed(queue.currentTrack || track, queue);
          const updatedButtons = createControlButtons(queue);
          await msg.edit({ embeds: [updatedEmbed], components: updatedButtons });
        } catch (e) {
          // Ignora caso mensagem seja apagada
        }
      });
    }).catch(console.error);
  }
});

player.events.on('emptyChannel', (queue) => {
  if (queue.metadata && queue.metadata.channel) {
    queue.metadata.channel.send('🚪 O canal de voz ficou vazio. Desconectando para economizar recursos...');
  }
});

player.events.on('emptyQueue', (queue) => {
  if (queue.metadata && queue.metadata.channel) {
    queue.metadata.channel.send('✅ Fila de músicas finalizada!');
  }
});

// Eventos de Tratamento de Erros no Player e Conexão de Voz
player.events.on('error', (queue, error) => {
  console.error('❌ [Player Queue Error]:', error);
});

player.events.on('playerError', (queue, error, track) => {
  console.error(`❌ [Track Error em ${track?.title || 'Música'}]:`, error);
});

player.events.on('connectionError', (queue, error) => {
  console.error('❌ [Voice Connection Error]:', error);
});

// Captura global de erros para evitar crash no Node.js/Railway
client.on('error', (err) => console.error('❌ [Discord Client Error]:', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ [Unhandled Rejection]:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ [Uncaught Exception]:', err));

// Evento quando o bot fica online
client.once('ready', async () => {
  console.log(`🟢 LS MÚSICAS Online como ${client.user.tag}!`);

  await setupPlayer();

  // Registrar os Comandos Slash no Discord
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('🔄 Registrando comandos Slash...');
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Comandos Slash registrados com sucesso no Servidor ID: ${GUILD_ID}`);
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log('✅ Comandos Slash registrados globalmente.');
    }
  } catch (error) {
    console.error('❌ Erro ao registrar comandos Slash:', error);
  }
});

// Tratador de Interações e Comandos Slash
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild, channel } = interaction;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel && ['play', 'pause', 'resume', 'skip', 'stop', 'volume', 'shuffle', 'clear', 'loop'].includes(commandName)) {
    return interaction.reply({ content: '❌ Você precisa estar conectado a um canal de voz para usar este comando!', ephemeral: true });
  }

  try {
    if (commandName === 'play') {
      await interaction.deferReply();
      const query = interaction.options.getString('busca');

      const searchResult = await player.search(query, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO
      });

      if (!searchResult || !searchResult.tracks.length) {
        return interaction.editReply('❌ Nenhuma música foi encontrada para a sua busca.');
      }

      try {
        const { queue } = await player.nodes.play(voiceChannel, searchResult, {
          nodeOptions: {
            metadata: { channel: channel, voiceChannel: voiceChannel },
            volume: 80,
            selfDeaf: true,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 30000,
            leaveOnEnd: false,
            bufferingTimeout: 10000,
            connectionTimeout: 60000,
            leaveOnStop: true
          },
          requestedBy: interaction.user,
          connectionOptions: {
            deaf: true
          }
        });

        if (searchResult.playlist) {
          return interaction.editReply(`✅ Playlist **${searchResult.playlist.title}** (${searchResult.tracks.length} músicas) adicionada à fila!`);
        } else {
          return interaction.editReply(`🎶 **${searchResult.tracks[0].title}** adicionada à fila!`);
        }
      } catch (playErr) {
        console.error('❌ [Erro na conexão de voz]:', playErr);
        if (playErr.name === 'AbortError' || playErr.message?.includes('aborted') || playErr.message?.includes('Timeout')) {
          return interaction.editReply('⚠️ **Erro de Conexão na Voz:**\nO tempo limite do handshake de áudio do Discord expirou no Railway. Tente usar `/play` novamente ou garanta que o bot tem permissões de "Conectar" e "Falar".');
        }
        return interaction.editReply(`❌ Não foi possível tocar a música: ${playErr.message || playErr}`);
      }
    }

    const queue = player.nodes.get(guild.id);

    if (!queue || !queue.isPlaying()) {
      if (['pause', 'resume', 'skip', 'stop', 'volume', 'nowplaying', 'shuffle', 'clear', 'loop', 'remove'].includes(commandName)) {
        return interaction.reply({ content: '❌ Não há nenhuma música tocando no momento neste servidor!', ephemeral: true });
      }
    }

    if (commandName === 'pause') {
      queue.node.pause();
      return interaction.reply('⏸️ Reprodução pausada!');
    }

    if (commandName === 'resume') {
      queue.node.resume();
      return interaction.reply('▶️ Reprodução retomada!');
    }

    if (commandName === 'skip') {
      queue.node.skip();
      return interaction.reply('⏭️ Música pulada!');
    }

    if (commandName === 'stop') {
      queue.delete();
      return interaction.reply('⏹️ Reprodução interrompida e canal desconectado.');
    }

    if (commandName === 'queue') {
      const currentTrack = queue.currentTrack;
      const tracks = queue.tracks.toArray().slice(0, 10);

      const queueString = tracks.map((t, idx) => `**${idx + 1}.** [${t.title}](${t.url}) - \`${t.duration}\` | por ${t.requestedBy}`).join('\n') || 'Nenhuma outra música na fila.';

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 Fila do LS MÚSICAS')
        .setDescription(`**Tocando Agora:**\n[${currentTrack.title}](${currentTrack.url}) - \`${currentTrack.duration}\`\n\n**Próximas Músicas:**\n${queueString}`)
        .setFooter({ text: `Total de ${queue.tracks.size} música(s) na fila` });

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'nowplaying') {
      const currentTrack = queue.currentTrack;
      const embed = createNowPlayingEmbed(currentTrack, queue);
      const components = createControlButtons(queue);
      return interaction.reply({ embeds: [embed], components: components });
    }

    if (commandName === 'volume') {
      const level = interaction.options.getInteger('nivel');
      queue.node.setVolume(level);
      return interaction.reply(`🔊 Volume ajustado para **${level}%**!`);
    }

    if (commandName === 'shuffle') {
      queue.tracks.shuffle();
      return interaction.reply('🔀 Fila embaralhada com sucesso!');
    }

    if (commandName === 'clear') {
      queue.tracks.clear();
      return interaction.reply('🗑️ Fila esvaziada com sucesso!');
    }

    if (commandName === 'loop') {
      const modo = interaction.options.getString('modo');
      if (modo === 'off') {
        queue.setRepeatMode(QueueRepeatMode.OFF);
        return interaction.reply('❌ Repetição desativada.');
      } else if (modo === 'track') {
        queue.setRepeatMode(QueueRepeatMode.TRACK);
        return interaction.reply('🔂 Repetição da MÚSICA ATUAL ativada!');
      } else if (modo === 'queue') {
        queue.setRepeatMode(QueueRepeatMode.QUEUE);
        return interaction.reply('🔁 Repetição da FILA INTEIRA ativada!');
      }
    }

    if (commandName === 'remove') {
      const num = interaction.options.getInteger('numero') - 1;
      const trackToRemove = queue.tracks.toArray()[num];
      if (!trackToRemove) {
        return interaction.reply({ content: '❌ Número de posição inválido na fila!', ephemeral: true });
      }
      queue.node.remove(trackToRemove);
      return interaction.reply(`🗑️ Removida: **${trackToRemove.title}** da fila.`);
    }

  } catch (error) {
    console.error(`❌ Erro ao executar o comando ${commandName}:`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Ocorreu um erro ao processar o comando.');
    } else {
      await interaction.reply({ content: '❌ Ocorreu um erro ao executar este comando.', ephemeral: true });
    }
  }
});

// Login do Bot no Discord
client.login(TOKEN);
