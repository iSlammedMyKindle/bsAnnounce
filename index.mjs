import {Client, ContextMenuCommandBuilder, ApplicationCommandType, Events} from 'discord.js';

// Grab the config
const {token, devGuild} = JSON.parse( await (await import('fs/promises')).readFile('./config.json') );
const client = new Client({intents:[]});

const yes = new ContextMenuCommandBuilder().setName("test").setType(ApplicationCommandType.Message);

// https://discordjs.guide/interactions/modals.html#building-and-responding-with-modals
// Looks like modals can be made on the fly, so when users submit data, you ping it right back to them
client.on(Events.InteractionCreate, i=>{
    console.log(i);
});

client.login(token).then(e=>{
    console.log('Bot logged in!');

    if(devGuild){
        client.guilds.fetch(devGuild).then(
            guild=>guild.commands.set([yes, {name:"stuff", description:'yes', type:1}])
        );
    }

    else client.commands.set([yes]);
});