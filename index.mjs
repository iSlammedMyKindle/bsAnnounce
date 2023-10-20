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

const modalBase = {title: "Create Game Day Event", customId:'createGameDayEvent'},
    title = {label:"Title", customId:"title", minLength:5, style:TextInputStyle.Short, required:false, placeholder:"Name your event!"},
    description = {label:"Description", customId:"description", minLength:100, style:TextInputStyle.Paragraph, placeholder:"What's this event about?", maxLength: 1500},
    calendarLink = {label:"Event Link", customId:"calendarLink", style:TextInputStyle.Short, "placeholder":"Link to your calendar event"};

// Let's never ever remove that tiny little space after "+ calendarLink +" - it will absolutely demolish the link because it thinks ) is part of it for some reason
const announcementFormat = (title, description, calendarLink, userId)=> "# "+ title + "\n\n (<@&"+ role + ">) [(event link)](" + calendarLink + " )\n" + description + "\n\n> **Host:** <@" + userId + ">";

const createEventModal = (existingTitle = '', existingDesc = '', existingCal = '')=>{
    const stuff = new ModalBuilder(modalBase);
    stuff.addComponents(
        { "components": [new TextInputBuilder(existingTitle ? {...title, value: existingTitle} : title)] },
        { "components": [new TextInputBuilder(existingDesc ? {...description, value: existingDesc} : description)] },
        { "components": [new TextInputBuilder(existingCal ? {...calendarLink, value: existingCal} : calendarLink)] },
    );
    return stuff;
}

// Looks like modals can be made on the fly, so when users submit data, you ping it right back to them
client.on(Events.InteractionCreate, async i=>{
    // stuff
    if(i.commandName == 'create-event'){
        const sessionData = (sessions[i.guildId] || {})[i.user.id]?.data;
        i.showModal(createEventModal(sessionData?.title, sessionData?.description, sessionData?.calendarLink));
    }

    else if(i.isModalSubmit()){
        // Store this new draft for later if you choose to come back
        // Scoped within this arrow function
        let title = i.fields.getField('title').value,
            description = i.fields.getField('description').value,
            calendarLink = i.fields.getField('calendarLink').value;

        let expires = new Date();
        expires.setHours(expires.getHours() + 24);
        // expires.setSeconds(expires.getSeconds() + 30);

        if(!sessions[i.guildId]) sessions[i.guildId] = {};
        sessions[i.guildId][i.user.id] = {
            data: {title, description, calendarLink},
            expires
        };

        // https://i.imgur.com/5MvfdxB.png
        if(/https:\/\/discord.com\/events\/[0-9]*\/[0-9]|https:\/\/discord.gg\/[a-zA-Z0-9]*\?event\=[0-9]*/.exec(calendarLink) == null){
            i.reply({content:"Invalid link! Make a calendar link that's tied to this server by going to the events section, clicking on the the 3 dots and copying the event link\n(https://i.imgur.com/5MvfdxB.png)", ephemeral: true, components: [
                new ActionRowBuilder({components:[
                    new ButtonBuilder({customId: "edit", style: ButtonStyle.Primary, label: "fiiiiiiiine"})
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
            new ButtonBuilder({customId: "edit", style: ButtonStyle.Primary, label: "Edit"}),
            new ButtonBuilder({customId: "discard", style: ButtonStyle.Secondary, label: "Discard"}),
            new ButtonBuilder({customId: "publish", style: ButtonStyle.Danger, label: "Publish"}),
        ]});

        i.reply({content:announcementFormat(title, description, calendarLink, i.user.id), ephemeral:true, embeds:[draftEmbed], components: [btnRow]});
    }

    else if(i.isButton()){
        const sessionData = (sessions[i.guildId] || {})[i.user.id]?.data;
        switch(i.customId){
            case "edit":
                i.showModal(createEventModal(sessionData?.title, sessionData?.description, sessionData?.calendarLink));
            break;
            case "publish":
                if(sessionData)
                    i.guild.channels.fetch(announcementChannel).then(channel=>channel.send(announcementFormat(sessionData?.title, sessionData?.description, sessionData?.calendarLink, i.user.id)));
            // fallthrough
            case "discard":
                if(sessionData){
                    delete (sessions[i.guildId] || {})[i.user.id];
                    i.reply({content:i.customId == "discard" ? "Draft discarded!" : "Published Draft! View the announcement in <#"+announcementChannel+">",  ephemeral: true});
                }
            break;
        }
    }
});

const commands = [{name:"create-event", description:'Create an event that will be posted in the game day channel', defaultMemberPermissions:"ManageEvents"}];

client.login(token).then(e=>{
    console.log('Bot logged in!');

    if(devGuild){
        client.guilds.fetch(devGuild).then(
            // guild=>guild.commands.set(commands)
        );
    }

    else client.application.commands.set(commands);
});