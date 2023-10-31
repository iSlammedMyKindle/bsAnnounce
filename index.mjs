import {Client, Events, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} from 'discord.js';

// Grab the config
const {token, devGuild, announcementChannel, role} = JSON.parse( await (await import('fs/promises')).readFile('./config.json') );
const client = new Client({intents:['Guilds']});

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
    "createGameDayEvent": {
        modalBase: {title: "Create Game Day Event", customId:'createGameDayEvent'},
        title: {label:"Title", customId:"title", minLength:5, style:TextInputStyle.Short, required:false, placeholder:"Name your event!"},
        description: {label:"Description", customId:"description", minLength:100, style:TextInputStyle.Paragraph, placeholder:"What's this event about?", maxLength: 1500},
        calendarLink: {label:"Event Link", customId:"calendarLink", style:TextInputStyle.Short, "placeholder":"Link to your calendar event"}
    },
    "askQuestion": {
        modalBase: {title: "Ask A Question To The Channel", customId:'askQuestion'},
        title: {label:"Title", customId:"title", minLength:5, style:TextInputStyle.Short, required:false, placeholder:"Question title"},
        description: {label:"Description", customId:"description", minLength:100, style:TextInputStyle.Paragraph, placeholder:"WHAT DO YOU WANT!?", maxLength: 1500},
    }
}

// Let's never ever remove that tiny little space after "+ calendarLink +" - it will absolutely demolish the link because it thinks ) is part of it for some reason
var msgFormats = {
    "createGameDayEvent": (title, description, userId, calendarLink)=> "# "+ title + "\n\n (<@&"+ role + ">) [(event link)](" + calendarLink + " )\n" + description + "\n\n> **Host:** <@" + userId + ">",
    "askQuestion": (title, description, userId)=> "# Question: " + title + "\n\n (<@&"+ role + ">)\n\n __<@" + userId + "> was wondering:__ " + description
};

const createModal = (modalType = '', existingTitle = '', existingDesc = '', existingCal = '')=>{
    const modalObjs = modals[modalType];

    const stuff = new ModalBuilder(modalObjs.modalBase);

    const components = [
        { "components": [new TextInputBuilder(existingTitle ? {...modalObjs?.title, value: existingTitle} : modalObjs?.title)] },
        { "components": [new TextInputBuilder(existingDesc ? {...modalObjs?.description, value: existingDesc} : modalObjs?.description)] },
    ]

    if(modalType == "createGameDayEvent") components.push({ "components": [new TextInputBuilder(existingCal ? {...modalObjs?.calendarLink, value: existingCal} : modalObjs?.calendarLink)] });

    stuff.addComponents(...components);
    return stuff;
}

// Looks like modals can be made on the fly, so when users submit data, you ping it right back to them
client.on(Events.InteractionCreate, async i=>{
    // There's only two modals using very similar formats, if this changes, this whole she-bang will need to be refactored XP
    // Getting away with this by the skin of my teeth basically
    if(i.commandName == 'create-event'){
        const sessionData = ((sessions[i.guildId] || {})[i.user.id] || {})["createGameDayEvent"];
        i.showModal(createModal("createGameDayEvent", sessionData?.title, sessionData?.description, sessionData?.calendarLink));
    }
    else if(i.commandName == 'ask-question'){
        const sessionData = ((sessions[i.guildId] || {})[i.user.id] || {})["askQuestion"];
        i.showModal(createModal("askQuestion", sessionData?.title, sessionData?.description));
    }

    else if(i.isModalSubmit()){
        // Store this new draft for later if you choose to come back
        // Scoped within this arrow function
        let title = i.fields.getField('title').value,
            description = i.fields.getField('description').value,
            calendarLink = i.customId == "createGameDayEvent" ? i.fields.getField('calendarLink')?.value : undefined;

        let expires = new Date();
        expires.setHours(expires.getHours() + 24);
        // expires.setSeconds(expires.getSeconds() + 30);

        if(!sessions[i.guildId]) sessions[i.guildId] = {};
        if(!sessions[i.guildId][i.user.id]) sessions[i.guildId][i.user.id] = {};

        const targetSession = sessions[i.guildId][i.user.id];
        targetSession.expires = expires;
        targetSession[i.customId] = {title, description, calendarLink};


        // https://i.imgur.com/5MvfdxB.png
        if(i.customId == "createGameDayEvent" && /https:\/\/discord.com\/events\/[0-9]*\/[0-9]|https:\/\/discord.gg\/[a-zA-Z0-9]*\?event\=[0-9]|https:\/\/discord.com\/invite\/*[a-zA-Z0-9]*\?event\=[0-9]/.exec(calendarLink) == null){
            i.reply({content:"Invalid link! Make a calendar link that's tied to this server by going to the events section, clicking on the the 3 dots and copying the event link\n(https://i.imgur.com/5MvfdxB.png)", ephemeral: true, components: [
                new ActionRowBuilder({components:[
                    new ButtonBuilder({customId: "edit-" + i.customId, style: ButtonStyle.Primary, label: "fiiiiiiiine"})
                ]})
            ]});
            
            return;
        }

        const draftEmbed = new EmbedBuilder({
            title: "Preview",
            description: "This is a preview of what your message will look like, ready to publish it to <#"+announcementChannel+">?",
            color:0xad1457 // PIIIIINK
        });

        const btnRow = new ActionRowBuilder({components:[
            new ButtonBuilder({customId: "edit-" + i.customId, style: ButtonStyle.Primary, label: "Edit"}),
            new ButtonBuilder({customId: "discard-" + i.customId, style: ButtonStyle.Secondary, label: "Discard"}),
            new ButtonBuilder({customId: "publish-" + i.customId, style: ButtonStyle.Danger, label: "Publish"}),
        ]});

        i.reply({content:msgFormats[i.customId](title, description, i.user.id, calendarLink), ephemeral:true, embeds:[draftEmbed], components: [btnRow]});
    }

    else if(i.isButton()){
        const idRegxp = /edit|publish|discard/.exec(i.customId);
        const modalId = i.customId.split("-")[1];
        const sessionData = ((sessions[i.guildId] || {})[i.user.id] || {})[modalId];

        switch(idRegxp[0]){
            case "edit":
                i.showModal(createModal(modalId, sessionData?.title, sessionData?.description, sessionData?.calendarLink));
            break;
            case "publish":
                if(sessionData)
                    i.guild.channels.fetch(announcementChannel).then(channel=>channel.send(msgFormats[modalId](sessionData?.title, sessionData?.description, i.user.id, sessionData?.calendarLink)));
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

const commands = [
    {name:"create-event", description:'Create an event that will be posted in the game day channel', defaultMemberPermissions:"ManageEvents"},
    {name:"ask-question", description:'Ask a question to users in the channel about an event', defaultMemberPermissions:"ManageEvents"}];

client.login(token).then(e=>{
    console.log('Bot logged in!');

    if(devGuild){
        client.guilds.fetch(devGuild).then(
            // guild=>guild.commands.set(commands)
        );
    }

    else client.application.commands.set(commands);
});