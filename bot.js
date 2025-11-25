const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs'); // Necesario para guardar/cargar estados
const mime = require('mime-types'); // Necesario para detectar el tipo de archivo local

// -----------------------------------------------------------
// 1. VARIABLES GLOBALES, CONFIGURACIÓN Y PERSISTENCIA
// -----------------------------------------------------------

const STATE_FILE = './group_states.json'; // Archivo para guardar los estados
let groupStates = {}; // Mapa { 'chatId': boolean_state }
let botOwnerId = null; // ID del dueño (se llena en 'ready')

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, 
        args: [ // Argumentos para optimizar el rendimiento y evitar latencia
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    },
});

// Función para cargar los estados desde el archivo
function loadStates() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            groupStates = JSON.parse(data);
            console.log('✅ Estados de grupo cargados desde el archivo.');
        } else {
            console.log('⚠️ Archivo de estados no encontrado. Inicializando vacío.');
        }
    } catch (e) {
        console.error('❌ Error al cargar estados:', e.message);
        groupStates = {}; 
    }
}

// Función para guardar los estados en el archivo
function saveStates() {
    try {
        // Guardamos el JSON con formato amigable (espacio 2)
        fs.writeFileSync(STATE_FILE, JSON.stringify(groupStates, null, 2), 'utf8');
        console.log('💾 Estados de grupo guardados correctamente.');
    } catch (e) {
        console.error('❌ Error al guardar estados:', e.message);
    }
}

client.on('qr', (qr) => {
    console.log('Por favor, escanea el código QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot de WhatsApp listo y funcionando!');
    loadStates(); // <--- Cargar estados al inicio
    botOwnerId = client.info.wid._serialized; 
    console.log(`ID del Propietario (Bot): ${botOwnerId}`);
});

client.on('auth_failure', msg => {
    console.error('❌ Fallo en la autenticación.');
});

client.initialize();

// -----------------------------------------------------------
// 2. LÓGICA DE COMANDOS E INTERACCIÓN
// -----------------------------------------------------------
// 1. DEFINICIÓN ESTRUCTURADA DE COMANDOS Y SUS ALIAS
const interactionCommandsDefinitions = [
    // --- Comandos Locales / General ---
    { 
        name: '#memes', 
        aliases: ['#momos', '#gracioso'], 
        text: 'ha encontrado un meme épico para', 
        type: 'local_image', // Tipo local
        path: './assets/memes/', // Ruta de la carpeta (ASEGÚRATE DE CREARLA)
        category: 'general'
    },
    
    // --- Comandos API (SFW de Waifu.pics) ---
    {
        name: '#kiss',
        aliases: ['#beso', '#muack'],
        text: 'le ha dado un beso a',
        type: 'api', // Tipo API
        apiCategory: 'kiss',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#hug',
        aliases: ['#abrazo', '#abrazar'],
        text: 'ha dado un abrazo tierno a',
        type: 'api', // Tipo API
        apiCategory: 'hug',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#slap',
        aliases: ['#cachetada', '#golpe'],
        text: 'ha dado una tremenda cachetada a',
        type: 'api', // Tipo API
        apiCategory: 'slap',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#pat',
        aliases: ['#palmadita'],
        text: 'le ha dado una palmadita de aprobación a',
        type: 'api', // Tipo API
        apiCategory: 'pat',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#cuddle',
        aliases: ['#acurrucar'],
        text: 'se ha acurrucado con',
        type: 'api', // Tipo API
        apiCategory: 'cuddle',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#wink',
        aliases: ['#guiño'],
        text: 'le ha guiñado el ojo a',
        type: 'api', // Tipo API
        apiCategory: 'wink',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#happy',
        aliases: ['#feliz', '#alegre'],
        text: 'está celebrando con',
        type: 'api', // Tipo API
        apiCategory: 'happy',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    {
        name: '#dance',
        aliases: ['#bailar', '#baile'],
        text: 'ha hecho un baile para',
        type: 'api', // Tipo API
        apiCategory: 'dance',
        apiUrlBase: 'https://api.waifu.pics/sfw/',
        category: 'anime_sfw'
    },
    // Comandos de Nekos.life
    {
        name: '#feed',
        aliases: ['#alimentar', '#comer'],
        text: 'ha alimentado a',
        type: 'api', // Tipo API
        apiCategory: 'feed',
        apiUrlBase: 'https://nekos.life/api/v2/img/',
        category: 'anime_sfw'
    },
    
    // --- Comandos NSFW (de diferentes APIs) ---
    {
        name: '#blowjob',
        aliases: ['#bj', '#mamada'],
        text: 'chupa con ganas a',
        type: 'api', // Tipo API
        apiCategory: 'blowjob',
        apiUrlBase: 'https://api.waifu.pics/nsfw/',
        category: 'nsfw'
    },
    {
        name: '#cum',
        aliases: ['#semen', '#corrida'],
        text: 'se vino dentro de',
        type: 'api', // Tipo API
        apiCategory: 'cum',
        apiUrlBase: 'https://api.waifu.pics/nsfw/', // Usando waifu.pics
        category: 'nsfw'
    },
];

// 2. GENERACIÓN DEL OBJETO DE COMANDOS FINAL (Incluye Alias)
const interactionCommands = {};

interactionCommandsDefinitions.forEach(cmd => {
    // 1. Añadir el comando principal (ej: '#kiss')
    interactionCommands[cmd.name] = cmd;

    // 2. Añadir los alias (ej: '#beso', '#muack')
    if (cmd.aliases && Array.isArray(cmd.aliases)) {
        cmd.aliases.forEach(alias => {
            // El alias apunta al mismo objeto del comando principal
            interactionCommands[alias] = cmd;
        });
    }
});

client.on('message_create', async msg => {
    // ----------------------------------------------------
    // [FIX] Evitar doble procesamiento
    // ----------------------------------------------------
    if (msg.timestamp && (Date.now() / 1000 - msg.timestamp > 10)) {
        return;
    }
    
    const body = msg.body;
    const chat = await msg.getChat();
    const chatId = chat.id._serialized; 

    // ----------------------------------------------------
    // LÓGICA DE ACTIVACIÓN / DESACTIVACIÓN (#off / #on)
    // ----------------------------------------------------
    if (body.toLowerCase() === '#off' || body.toLowerCase() === '#on') {
        
        const sender = await msg.getContact();
        const senderId = sender.id._serialized;
        let canToggle = false;

        // 1. Verificar si es el Propietario del Bot
        if (senderId === botOwnerId) {
            canToggle = true;
        }

        // 2. Verificar si es Administrador de Grupo
        if (!canToggle && chat.isGroup) {
            const participant = chat.participants.find(p => p.id._serialized === senderId);
            if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
                canToggle = true;
            }
        }

        // 3. Ejecutar la acción si está autorizado
        if (canToggle) {
            const desiredState = body.toLowerCase() === '#on';
            
            // Si el estado no está en el mapa, es ACTIVO por defecto (true)
            const currentState = groupStates[chatId] !== false; 

            if (desiredState === currentState) {
                await client.sendMessage(chatId, `El bot ya está ${currentState ? 'activo' : 'desactivado'} en este chat.`, { quotedMessageId: msg.id._serialized });
            } else {
                
                if (desiredState) {
                    delete groupStates[chatId]; // Si se activa, lo borramos para usar el 'default: true'
                } else {
                    groupStates[chatId] = false; // Si se desactiva, lo marcamos explícitamente como false
                }
                saveStates(); // <--- GUARDAR ESTADO PERSISTENTE
                
                await client.sendMessage(chatId, `✅ ¡Bot ${desiredState ? 'ACTIVADO' : 'DESACTIVADO'} con éxito para este chat!`, { quotedMessageId: msg.id._serialized });
            }
            return; 
        } else {
            // No autorizado
            await client.sendMessage(chatId, `❌ Este comando está restringido a Administradores de Grupo y al Propietario del Bot.`, { quotedMessageId: msg.id._serialized });
            return; 
        }
    }
    
    // ----------------------------------------------------
    // LÓGICA DEL COMANDO #HELP (Mostrar comandos categorizados)
    // ----------------------------------------------------
    if (body.toLowerCase() === '#help') {
        
        // Función auxiliar para listar comandos por categoría
        const listCommands = (category) => {
            let list = '';
            
            // Filtra y formatea solo los comandos de la categoría dada
            interactionCommandsDefinitions.filter(cmd => cmd.category === category).forEach(cmd => {
                const aliases = cmd.aliases.length > 0 ? ` [${cmd.aliases.join(', ')}]` : '';
                // Formato: 🔸 #comando [alias1, alias2]: descripción
                list += `🔸 *${cmd.name}*${aliases}:\n   _${cmd.text} (menciona a alguien o cita un mensaje)_\n`;
            });

            return list.trim(); // Devuelve la lista sin espacios al inicio/final
        };
        
        // Array para construir el mensaje completo línea por línea
        let helpMessageParts = [];
        
        helpMessageParts.push('👋 *Hola!* *Soy* Minato (bot) Aquí tienes una lista de los comandos disponibles:\n');
        helpMessageParts.push('✨ *Comandos Públicos* ✨');

        // --- GENERAL ---
        const generalList = listCommands('general');
        if (generalList) {
            helpMessageParts.push('\n🖼️ **General/Memes**:\n');
            helpMessageParts.push(generalList);
        }

        // --- ANIME SFW ---
        const sfwList = listCommands('anime_sfw');
        if (sfwList) {
            helpMessageParts.push('\n💖 **Reacciones Anime**:\n');
            helpMessageParts.push(sfwList);
        }

        // --- NSFW ---
        const nsfwList = listCommands('nsfw');
        if (nsfwList) {
            helpMessageParts.push('\n🔞 **Reacciones NSFW**:\n');
            helpMessageParts.push(nsfwList);
        }

        // --- ADMIN ---
        const adminCommands = `
🛡️ *Comandos de Administración* 🛡️
_Solo pueden usarlos los Administradores de Grupo y el Propietario del Bot._

🔹 *#on*: Activa el bot para este chat.
🔹 *#off*: Desactiva el bot para este chat.
`;

        helpMessageParts.push(adminCommands);
        
        // Unir todas las partes con un salto de línea
        const finalMessage = helpMessageParts.join('\n').trim();

        await client.sendMessage(chatId, finalMessage, { quotedMessageId: msg.id._serialized });
        return;
    }
    
    // ----------------------------------------------------
    // VERIFICACIÓN DE ESTADO ANTES DE CUALQUIER OTRO COMANDO
    // ----------------------------------------------------
    const chatIsActive = groupStates[chatId] !== false; 

    if (!chatIsActive && body.startsWith('#')) {
        // Si el chat está desactivado, ignoramos el comando (excepto #on/#off/#help)
        return;
    }
    // ----------------------------------------------------
    
    if (!body.startsWith('#')) return;

    const parts = body.split(' ');
    const command = parts[0].toLowerCase();

    if (interactionCommands[command]) {
        console.log(`Comando detectado: ${command}`);

        const commandData = interactionCommands[command];
        
        // Obtener el remitente una sola vez
        const sender = await msg.getContact();
        const senderName = sender.pushname || sender.verifiedName || 'Un Usuario Anónimo';

        // ------------------------------------------------------------------
        // --- 1. PROCESAMIENTO DE COMANDO LOCAL (Memes) ---
        // ------------------------------------------------------------------
        if (commandData.type === 'local_image') {
            try {
                // Leer archivos en el directorio y filtrar por extensiones de imagen
                const files = fs.readdirSync(commandData.path).filter(f => /\.(jpe?g|png|gif)$/i.test(f));
                
                if (files.length === 0) {
                    await client.sendMessage(chatId, `❌ No hay imágenes en la carpeta ${commandData.path}. Por favor, añade archivos JPG, PNG o GIF.`);
                    return;
                }
                
                // Seleccionar archivo al azar
                const randomFile = files[Math.floor(Math.random() * files.length)];
                const fullPath = commandData.path + randomFile;
                
                // Obtener tipo MIME
                const mimeType = mime.lookup(fullPath); 
                if (!mimeType) {
                     await client.sendMessage(chatId, `❌ No se pudo determinar el tipo de archivo para: ${randomFile}`);
                     return;
                }
                
                const mediaToSend = MessageMedia.fromFilePath(fullPath);
                
                // LÓGICA DE GIF LOCAL APLICADA AQUÍ (CLAVE PARA REPRODUCCIÓN)
                const isLocalGif = mimeType.includes('gif');
                
                const options = { 
                    caption: `¡${commandData.text} ${senderName}!`, 
                    quotedMessageId: msg.id._serialized,
                    // Si es un GIF, forzar que se envíe como video/GIF animado
                    sendVideoAsGif: isLocalGif 
                };

                await client.sendMessage(chatId, mediaToSend, options);
                
            } catch (error) {
                console.error('❌ Error al procesar imagen local:', error.message);
                await client.sendMessage(chatId, `❌ Hubo un error al procesar el meme local: ${error.message}`);
            }
            return; // Salir después de procesar el comando local

        // ------------------------------------------------------------------
        // --- 2. PROCESAMIENTO DE COMANDO API (Interacciones Gacha) ---
        // ------------------------------------------------------------------
        } else if (commandData.type === 'api') {
            
            // Variables para el objetivo
            let targetContact;
            let targetName;
            let mentions = []; // JIDs serializados

            // ----------------------------------------------------
            // 2. LÓGICA DE DETECCIÓN DE OBJETIVO (PRIVADO vs GRUPO)
            // ----------------------------------------------------
            if (chat.isGroup) {
                // MODO GRUPO: Requiere una mención (@)
                const mentionedContacts = await msg.getMentions();

                if (mentionedContacts.length === 0) {
                    await client.sendMessage(chatId, 
                        `En un grupo, debes mencionar a un usuario. Ejemplo: ${command} @NombreDeUsuario`,
                        { quotedMessageId: msg.id._serialized } // Citar la respuesta
                    );
                    return;
                }
                targetContact = mentionedContacts[0];
                targetName = targetContact.pushname || targetContact.verifiedName || 'Alguien';
                
                // Mapear Contact a JID serializado
                mentions = mentionedContacts.map(contact => contact.id._serialized);
                
            } else {
                // MODO PRIVADO: Objetivo es el citado o el Bot por defecto
                let isQuotedInteraction = false;
                
                if (msg.hasQuotedMsg) {
                    const quotedMsg = await msg.getQuotedMessage();
                    
                    if (!quotedMsg.fromMe) {
                        targetContact = await quotedMsg.getContact();
                        targetName = targetContact.pushname || targetContact.verifiedName || 'Tu Amigo';
                        isQuotedInteraction = true;
                    }
                }

                if (!isQuotedInteraction) {
                    try {
                        targetContact = await client.getContactById(chat.id.user); 
                        targetName = targetContact.pushname || targetContact.verifiedName || 'El Bot';
                    } catch (e) {
                        targetName = 'El Bot'; 
                    }
                }
            }

            // ----------------------------------------------------
            // 3. GENERACIÓN DE MENSAJE Y OBTENCIÓN DE MEDIA
            // ----------------------------------------------------
            
            const actionText = commandData.text;
            const responseText = 
                `*${senderName}* ${actionText} *${targetName}*`;

            const apiCategory = commandData.apiCategory;
            let bufferMedia = null; 
            let mimeType = '';

            try {
                const apiUrl = `${commandData.apiUrlBase}${apiCategory}`; 
                const apiResponse = await axios.get(apiUrl);
                
                const imageUrl = apiResponse.data.url; 

                const imageResponse = await axios.get(imageUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 5000,
                    maxRedirects: 5
                });
                bufferMedia = Buffer.from(imageResponse.data);
                mimeType = imageResponse.headers['content-type'];
                
            } catch (error) {
                console.error(`❌ Error al obtener media de API para ${apiCategory}:`, error.message);
            }
            
            // 4. ENVIAR RESPUESTA (Usando chatId y citando el mensaje)
            
            const quotedOptions = { 
                quotedMessageId: msg.id._serialized 
            };

            if (bufferMedia) {
                
                // LÓGICA DE GIF/VIDEO API APLICADA AQUÍ
                const isGifOrVideo = mimeType.includes('gif') || mimeType.includes('webm') || mimeType.includes('mp4');
                
                const mediaToSend = new MessageMedia(
                    mimeType, 
                    bufferMedia.toString('base64'), 
                    'interaction_media'
                );
                
                const finalOptions = {
                    caption: responseText, 
                    mentions: mentions,
                    ...quotedOptions,
                    sendVideoAsGif: isGifOrVideo // Esto es clave para la reproducción animada
                };
                
                await client.sendMessage(chatId, mediaToSend, finalOptions);

            } else {
                // Fallback de solo texto (si falló la descarga de media)
                await client.sendMessage(chatId, responseText + '\n\n❌ No se pudo cargar la imagen de la API.', { 
                    mentions: mentions,
                    ...quotedOptions,
                });
            }
        } // Fin del else if (commandData.type === 'api')
    } // Fin del if (interactionCommands[command])
});