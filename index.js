// ============================================
// FROGGY BOT - Versión mejorada
// ============================================

// Esto carga el archivo .env donde guardaremos el token de forma segura
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const http = require('http');

// ============================================
// Mini servidor web (solo para plataformas tipo Glitch)
// Esto permite que un servicio externo (como UptimeRobot)
// le haga una visita cada pocos minutos y evite que el
// proyecto se "duerma" por inactividad.
// No afecta en nada al funcionamiento del bot en Discord.
// ============================================

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🐸 Froggy está despierto y funcionando.');
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ============================================
// Cargar y guardar datos
// ============================================

let datos = {};

try {
    datos = JSON.parse(fs.readFileSync('./mascotas.json', 'utf8'));
} catch {
    datos = {};
}

function guardar() {
    fs.writeFileSync('./mascotas.json', JSON.stringify(datos, null, 2));
}

// Puntuación de una mascota
function puntuacion(mascota) {
    return mascota.vida + mascota.energia + mascota.hambre + mascota.felicidad;
}

// Genera la lista completa de todas las mascotas, ordenada igual
// que el ranking (por nivel y luego por puntuación).
function listaCompleta() {
    const mascotas = Object.entries(datos)
        .filter(([id, mascota]) => id !== 'config' && mascota?.nombre)
        .sort((a, b) => {
            const nivelA = a[1].nivel || 0;
            const nivelB = b[1].nivel || 0;
            if (nivelB !== nivelA) return nivelB - nivelA;
            return puntuacion(b[1]) - puntuacion(a[1]);
        });

    if (mascotas.length === 0) {
        return '🐸 Todavía no hay mascotas adoptadas en el servidor.';
    }

    let texto = '📋 **LISTA COMPLETA DE MASCOTAS**\n\n';

    mascotas.forEach(([userId, mascota], index) => {
        const nivel = mascota.nivel || 0;
        texto += `**${index + 1}.** ${mascota.nombre} — 🏅 Nivel ${nivel} — ⭐ ${puntuacion(mascota)} pts\n`;
    });

    // Discord no permite mensajes de más de 2000 caracteres.
    // Si la lista es muy larga, la recortamos para evitar un error.
    if (texto.length > 1900) {
        texto = texto.slice(0, 1900) + '\n\n… (lista recortada, hay demasiadas mascotas)';
    }

    return texto;
}

// Botón "Ver más miembros" que se añade debajo del ranking público
const filaBotonRanking = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('ver_mas_miembros')
        .setLabel('👀 Ver más miembros')
        .setStyle(ButtonStyle.Secondary)
);

// ============================================
// Actualizar ranking
// ============================================

async function actualizarRanking() {
    if (!datos.config?.rankingChannelId) return;

    const canal = await client.channels
        .fetch(datos.config.rankingChannelId)
        .catch(() => null);

    if (!canal || !canal.isTextBased()) return;

    // Ordenamos primero por NIVEL (de más a menos), y si hay empate,
    // por puntuación general. Solo mostramos el TOP 3.
    const mascotas = Object.entries(datos)
        .filter(([id, mascota]) => id !== 'config' && mascota?.nombre)
        .sort((a, b) => {
            const nivelA = a[1].nivel || 0;
            const nivelB = b[1].nivel || 0;
            if (nivelB !== nivelA) return nivelB - nivelA;
            return puntuacion(b[1]) - puntuacion(a[1]);
        })
        .slice(0, 3);

    let mensaje = '🏆 **MEJORES MASCOTAS DEL SERVIDOR** 🐸\n\n';

    if (mascotas.length === 0) {
        mensaje += 'Todavía no hay mascotas adoptadas.';
    } else {
        mascotas.forEach(([userId, mascota], index) => {
            const puestos = ['🥇', '🥈', '🥉'];
            const puesto = puestos[index] || `**${index + 1}.**`;
            const nivel = mascota.nivel || 0;

            mensaje +=
                `${puesto} **${mascota.nombre}**\n\n` +
                `🏅 Nivel: **${nivel}**\n\n` +
                `❤️ Vida: **${mascota.vida}**\n\n` +
                `⚡ Energía: **${mascota.energia}**\n\n` +
                `🍖 Hambre: **${mascota.hambre}**\n\n` +
                `😊 Felicidad: **${mascota.felicidad}**\n\n` +
                `⭐ Puntuación: **${puntuacion(mascota)}**\n\n` +
                `━━━━━━━━━━━━━━━━━━\n\n`;
        });
    }

    try {
        const mensajes = await canal.messages.fetch({ limit: 20 });

        const anterior = mensajes.find(
            m =>
                m.author.id === client.user.id &&
                m.content.startsWith('🏆 **MEJORES MASCOTAS')
        );

        if (anterior) {
            await anterior.edit({ content: mensaje, components: [filaBotonRanking] });
        } else {
            await canal.send({ content: mensaje, components: [filaBotonRanking] });
        }
    } catch (error) {
        console.error('Error actualizando el ranking:', error);
    }
}

// ============================================
// Bot listo
// ============================================

client.once('ready', () => {
    console.log(`🐸 Froggy está conectado como ${client.user.tag}`);

    client.user.setActivity('🐸 Cuidando mascotas🐸', {
        type: 0
    });
});

// ============================================
// UN SOLO reloj que revisa cada minuto qué toca hacer
// (antes había 5 relojes independientes que se podían pisar entre sí)
// ============================================

let contadorMinutos = 0;

setInterval(() => {
    contadorMinutos++;
    let huboCambios = false;

    for (const userId in datos) {
        if (userId === 'config') continue;
        const m = datos[userId];

        // ❤️ Vida -1 cada 5 minutos
        if (contadorMinutos % 5 === 0) {
            m.vida = Math.max(0, m.vida - 1);
            huboCambios = true;
        }

        // ⚡ Energía -2 cada 5 minutos
        if (contadorMinutos % 5 === 0) {
            m.energia = Math.max(0, m.energia - 2);
            huboCambios = true;
        }

        // 🍖 Hambre -1 cada 3 minutos
        if (contadorMinutos % 3 === 0) {
            m.hambre = Math.max(0, m.hambre - 1);
            huboCambios = true;
        }

        // 😊 Felicidad -1 cada 10 minutos
        if (contadorMinutos % 10 === 0) {
            m.felicidad = Math.max(0, m.felicidad - 1);
            huboCambios = true;
        }

        // 🏅 SISTEMA DE NIVELES
        // Si la mascota tiene la vida a 100, sumamos un minuto al contador.
        // Al llegar a 10 minutos SEGUIDOS con vida 100, sube un nivel.
        // Si en algún momento la vida baja de 100, el contador se reinicia a 0.
        if (m.nivel === undefined) m.nivel = 0;
        if (m.minutosVida100 === undefined) m.minutosVida100 = 0;

        if (m.vida === 100) {
            m.minutosVida100++;

            if (m.minutosVida100 >= 10) {
                m.nivel++;
                m.minutosVida100 = 0;
                huboCambios = true;
            }
        } else {
            if (m.minutosVida100 !== 0) huboCambios = true;
            m.minutosVida100 = 0;
        }
    }

    if (huboCambios) {
        guardar();
    }
}, 60 * 1000);

// ============================================
// Reloj aparte SOLO para refrescar el ranking cada 20 segundos.
// Va separado del reloj de arriba para que la vida/energía/hambre/
// felicidad de las mascotas sigan bajando a la misma velocidad de
// siempre, aunque el ranking se vea más "al momento".
// ============================================

setInterval(() => {
    actualizarRanking().catch(console.error);
}, 20 * 1000);

// ============================================
// Botón "Ver más miembros" del ranking
// (siempre responde solo visible para quien lo pulsa)
// ============================================

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'ver_mas_miembros') return;

    try {
        await interaction.reply({
            content: listaCompleta(),
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error mostrando la lista completa:', error);
    }
});

// ============================================
// Comandos
// ============================================

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;

    // Envolvemos TODO en un try/catch: si algo falla, el usuario
    // recibe un aviso en vez de quedarse con el bot "pensando" para siempre
    try {
        // 🐸 ADOPTAR
        if (interaction.commandName === 'adoptar') {
            const nombre = interaction.options.getString('nombre');

            if (datos[userId]) {
                return interaction.reply({
                    content: '🐸 Ya tienes una mascota adoptada.',
                    flags: MessageFlags.Ephemeral
                });
            }

            datos[userId] = {
                nombre: nombre,
                nivel: 0,
                minutosVida100: 0,
                vida: 100,
                energia: 100,
                hambre: 100,
                felicidad: 100
            };

            guardar();
            actualizarRanking().catch(console.error);

            return interaction.reply({
                content: `🎉 ¡Has adoptado a **${nombre}**! 🐸💚`,
                flags: MessageFlags.Ephemeral
            });
        }

        // ✏️ RENOMBRAR
        if (interaction.commandName === 'renombrar') {
            if (!datos[userId]) {
                return interaction.reply({
                    content: '❌ Primero tienes que adoptar una mascota con /adoptar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const nuevoNombre = interaction.options.getString('nombre');
            const nombreAnterior = datos[userId].nombre;

            datos[userId].nombre = nuevoNombre;
            guardar();
            actualizarRanking().catch(console.error);

            return interaction.reply({
                content: `✏️ **${nombreAnterior}** ahora se llama **${nuevoNombre}** 🐸`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 🐸 FROGGY
        if (interaction.commandName === 'froggy') {
            if (!datos[userId]) {
                return interaction.reply({
                    content: '❌ Primero tienes que adoptar una mascota con /adoptar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const mascota = datos[userId];
            const nivel = mascota.nivel || 0;

            return interaction.reply({
                content:
                    `🐸 **${mascota.nombre}**\n\n` +
                    `🏅 Nivel: **${nivel}**\n\n` +
                    `❤️ Vida: **${mascota.vida}/100**\n\n` +
                    `⚡ Energía: **${mascota.energia}/100**\n\n` +
                    `🍖 Hambre: **${mascota.hambre}/100**\n\n` +
                    `😊 Felicidad: **${mascota.felicidad}/100**`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 🍽️ ALIMENTAR
        if (interaction.commandName === 'alimentar') {
            if (!datos[userId]) {
                return interaction.reply({
                    content: '❌ Primero tienes que adoptar una mascota con /adoptar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const comida = interaction.options.getString('comida');

            const comidas = {
                pienso: 10,
                carne: 25,
                manzana: 15,
                zanahoria: 12,
                kiwi: 20
            };

            const mascota = datos[userId];
            mascota.hambre = Math.min(100, mascota.hambre + comidas[comida]);

            guardar();
            actualizarRanking().catch(console.error);

            return interaction.reply({
                content:
                    `🐸 **${mascota.nombre}** ha comido **${comida}** 🍽️\n` +
                    `🍖 Hambre: **${mascota.hambre}/100**`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 🏃 ACTIVIDAD (sube energía)
        if (interaction.commandName === 'actividad') {
            if (!datos[userId]) {
                return interaction.reply({
                    content: '❌ Primero tienes que adoptar una mascota con /adoptar.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const actividadElegida = interaction.options.getString('actividad');

            const actividades = {
                futbol: { nombre: 'jugar al fútbol', energia: 3, emoji: '⚽' },
                gimnasio: { nombre: 'ir al gimnasio', energia: 4, emoji: '🏋️' },
                tenis: { nombre: 'jugar al tenis', energia: 2, emoji: '🎾' },
                badminton: { nombre: 'jugar al bádminton', energia: 2, emoji: '🏸' },
                baloncesto: { nombre: 'jugar al baloncesto', energia: 3, emoji: '🏀' }
            };

            const actividad = actividades[actividadElegida];
            const mascota = datos[userId];

            mascota.energia = Math.min(100, mascota.energia + actividad.energia);

            guardar();
            actualizarRanking().catch(console.error);

            return interaction.reply({
                content:
                    `${actividad.emoji} **${mascota.nombre}** ha ido a ${actividad.nombre}\n\n` +
                    `⚡ Energía: **${mascota.energia}/100** (+${actividad.energia})`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 📢 DECIR (envía un mensaje como Froggy, SOLO el propietario)
        if (interaction.commandName === 'decir') {
            const ID_PROPIETARIO = '1273291429032104027';

            if (interaction.user.id !== ID_PROPIETARIO) {
                return interaction.reply({
                    content: '❌ Solo el propietario del bot puede usar este comando.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const mensajeATexto = interaction.options.getString('mensaje');
            const canalElegido = interaction.options.getChannel('canal');

            if (!canalElegido.isTextBased()) {
                return interaction.reply({
                    content: '❌ Ese canal no admite mensajes de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                await canalElegido.send(mensajeATexto);
            } catch (error) {
                return interaction.reply({
                    content: '❌ No he podido enviar el mensaje. Comprueba que tengo permiso para escribir en ese canal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: `✅ Mensaje enviado en ${canalElegido}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 🏆 CONFIGURAR RANKING (solo administradores)
        if (interaction.commandName === 'ranking') {
            if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: '❌ Solo un administrador puede configurar el canal de ranking.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const canal = interaction.options.getChannel('canal');

            datos.config = datos.config || {};
            datos.config.rankingChannelId = canal.id;

            guardar();
            await actualizarRanking();

            return interaction.reply({
                content: `🏆 Ranking configurado en ${canal}.`,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error('Error procesando un comando:', error);

        const payload = {
            content: '❌ Ha ocurrido un error inesperado. Inténtalo de nuevo en un momento.',
            flags: MessageFlags.Ephemeral
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
});

// ============================================
// Redes de seguridad: si algo falla en cualquier
// otra parte del programa, lo anotamos en vez de
// que el bot se caiga entero
// ============================================

process.on('unhandledRejection', (error) => {
    console.error('Error no controlado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Excepción no controlada:', error);
});

// .trim() elimina espacios, saltos de línea u otros caracteres
// invisibles que algunas plataformas añaden por error al guardar
// la variable de entorno del token.
client.login(process.env.DISCORD_TOKEN?.trim());