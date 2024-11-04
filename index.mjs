/* Why Hello there! This is a fork of gameDayPoster - it's a simplified version of that,
    with the ability to make automatic announcements based on Discord activity.
    It was tuned for Beatsaber, but it doesn't really matter what's configured (see config.example.json)
    I didn't feel like generalizing game day poster, though at some point I may have to.
    Generalizing the orignal would require database work, but if there starts to be much more demand for something like this, it may be worth considering making this more professional
*/

import {Client, Events, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors} from 'discord.js';

// Grab the config
const {token, devGuild, announcementChannel, autoAnnouncementChannel, role, msgData} = JSON.parse( await (await import('fs/promises')).readFile('./config.json') );
const client = new Client({intents:['Guilds', 'GuildPresences']});

// https://discordjs.guide/interactions/modals.html#building-and-responding-with-modals
// https://discord.com/developers/docs/interactions/message-components

// Store existing sessions here
/*{
    <guildId>:{
        <userId>:{
            data:{title, description, calandarLink},
            expires: <date>
        }
    }
}*/
const sessions = {};

// Set the routine to remove expired sessions every hour
setInterval(()=>{
    for(let guild in sessions){
        for(let user in sessions[guild]){
            if(new Date() > sessions[guild][user].expires){
                delete sessions[guild][user];
                console.log("Deleted session from user", user, "from guild", guild);
            }
        }
    }
}, 1000 * 60 * 60);
// }, 30000);

const modals = {
    "announce": {
        modalBase: {title: "Make an announcement to the channel", customId:'announce'},
        title: {label:"Title", customId:"title", minLength:5, style:TextInputStyle.Short, required:false, placeholder:"Announcement title"},
        description: {label:"Description", customId:"description", minLength:100, style:TextInputStyle.Paragraph, placeholder:"Announcement Body - send a message up to 1500 characters!", maxLength: 1500},
    }
}

var msgFormats = {
    "announce": (title, description, userId, role)=> `# ${title}\n\n (${ role == '@everyone' ? role: "<@&"+ role + ">"})\n\n${description}\n\n __Author: <@${userId}>__`
};

const createModal = (modalType = '', existingTitle = '', existingDesc = '')=>{
    const modalObjs = modals[modalType];

    const stuff = new ModalBuilder(modalObjs.modalBase);

    const components = [
        { "components": [new TextInputBuilder(existingTitle ? {...modalObjs?.title, value: existingTitle} : modalObjs?.title)] },
        { "components": [new TextInputBuilder(existingDesc ? {...modalObjs?.description, value: existingDesc} : modalObjs?.description)] }
    ];

    stuff.addComponents(...components);
    return stuff;
}

// Looks like modals can be made on the fly, so when users submit data, you ping it right back to them
client.on(Events.InteractionCreate, async i=>{
    // There's only two modals using very similar formats, if this changes, this whole she-bang will need to be refactored XP
    // Getting away with this by the skin of my teeth basically

    // EDIT: Or just recycle this old piece of bot code like I'm doing right now XP

    // Collect the role name in order to display the name
    const roleLabel = i.guild.roles.cache.get(role).name;
    
    if(i.commandName == 'announce'){
        const sessionData = ((sessions[i.guildId] || {})[i.user.id] || {})["announce"];
        i.showModal(createModal("announce", sessionData?.title, sessionData?.description));
    }

    else if(i.isModalSubmit()){
        // Store this new draft for later if you choose to come back
        // Scoped within this arrow function
        let title = i.fields.getField('title').value,
            description = i.fields.getField('description').value

        let expires = new Date();
        expires.setHours(expires.getHours() + 24);
        // expires.setSeconds(expires.getSeconds() + 30);

        if(!sessions[i.guildId]) sessions[i.guildId] = {};
        if(!sessions[i.guildId][i.user.id]) sessions[i.guildId][i.user.id] = {};

        const targetSession = sessions[i.guildId][i.user.id];
        targetSession.expires = expires;
        targetSession[i.customId] = {title, description};

        const draftEmbed = new EmbedBuilder({
            title: "Preview",
            description: "This is a preview of what your message will look like, ready to publish it to <#"+announcementChannel+">?",
            color: Colors.Blurple
        });

        const btnRow = new ActionRowBuilder({components:[
            new ButtonBuilder({customId: "edit-" + i.customId, style: ButtonStyle.Primary, label: "Edit"}),
            new ButtonBuilder({customId: "discard-" + i.customId, style: ButtonStyle.Secondary, label: "Discard"}),
            new ButtonBuilder({customId: "publishotherrole-" + i.customId, style: ButtonStyle.Danger, label: "Ping @" + roleLabel}),
            new ButtonBuilder({customId: "publisheveryone-" + i.customId, style: ButtonStyle.Danger, label: "Ping @everyone"}),
        ]});


        i.reply({content:msgFormats[i.customId](title, description, i.user.id), ephemeral:true, embeds:[draftEmbed], components: [btnRow]});
    }

    else if(i.isButton()){
        const idRegxp = /edit|publish|discard/.exec(i.customId);
        const modalId = i.customId.split("-")[1];
        const sessionData = ((sessions[i.guildId] || {})[i.user.id] || {})[modalId];

        switch(idRegxp[0]){
            case "edit":
                i.showModal(createModal(modalId, sessionData?.title, sessionData?.description));
            break;
            case "publish":
                if(sessionData)
                    i.guild.channels.fetch(announcementChannel).then(channel=>channel.send(msgFormats[modalId](sessionData?.title, sessionData?.description, i.user.id, i.customId.indexOf('everyone') > -1 ? '@everyone' : role)));
            // fallthrough
            case "discard":
                if(sessionData){
                    delete ((sessions[i.guildId] || {})[i.user.id] || {})[modalId];
                    i.reply({content: idRegxp[0] == "discard" ? "Draft discarded!" : "Published Draft! View the announcement in <#"+announcementChannel+">",  ephemeral: true});
                }
            break;
        }
    }
});

// This bot's specific feature - automatic detection of the game and it's state
client.on('presenceUpdate', async function(_oldPresence, activePresence){
    console.log('presence', arguments);
    for(const activity of activePresence.activities){
        if(activity.name == msgData.name && activity.state == msgData.state && activity.url?.indexOf(msgData.url) == 0){
            // Post to the designated channel
            // Grab the user avatar based on the previous data
            const user = activePresence.user;
            const embed = new EmbedBuilder()
                .setTitle(msgData.title.replaceAll('%user', user.username))
                .setImage(user.avatarURL())
                .setDescription(msgData.desc.replaceAll('%user', user.username))
                .setURL(activity.url)
                .setColor(Colors.Blurple)
            
            // Find the target discord and search for the channel
            await activePresence.guild.channels.cache.get(autoAnnouncementChannel).send({content:`(<@&${role}>)`, embeds:[embed]});
        }
    }
});

const commands = [
    {name:"announce", description:'Send an announcement about the game'}
];

client.login(token).then(e=>{
    console.log('Bot logged in!');

    if(devGuild){
        client.guilds.fetch(devGuild).then(
            // guild=>guild.commands.set(commands)
        );
    }

    else client.application.commands.set(commands);
});