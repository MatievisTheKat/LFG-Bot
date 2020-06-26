require("dotenv").config();

const { Client, RichEmbed } = require("discord.js");

const client = new Client();
client.prefix = "-";
const URI = process.env.URI;
const ms = require("ms");
const mongoose = require("mongoose");
mongoose.connect(URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const setup = mongoose.model(
  "setup",
  new mongoose.Schema({
    userID: String,
    exitMessageID: String,
    channelID: String,
    messageID: String,
    postChannelID: String,
    desc: String,
    count: Number,
    endAmount: Number,
  })
);

const reports = mongoose.model(
  "reports",
  new mongoose.Schema({
    guildID: String,
    channelID: String,
  })
);

client.on("error", (err) => console.error(err));

client.once("ready", async () => {
  client.user.setPresence({
    game: {
      name: `out for group posts! | ${client.prefix}post`,
      type: "WATCHING",
    },
    status: "online",
  });
  console.log(
    `${client.user.username} has successfully logged into ${client.guilds.size} servers`
  );
  setup.find().map((d) => d.delete());
});

client.on("raw", async (packet) => {
  if (!["MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE"].includes(packet.t))
    return;
  const channel = client.channels.get(packet.d.channel_id);
  if (channel.messages.has(packet.d.message_id)) return;
  channel.fetchMessage(packet.d.message_id).then((message) => {
    const emoji = packet.d.emoji.id
      ? `${packet.d.emoji.name}:${packet.d.emoji.id}`
      : packet.d.emoji.name;
    const reaction = message.reactions.get(emoji);
    if (reaction)
      reaction.users.set(packet.d.user_id, client.users.get(packet.d.user_id));
    if (packet.t === "MESSAGE_REACTION_ADD") {
      client.emit(
        "messageReactionAdd",
        reaction,
        client.users.get(packet.d.user_id)
      );
    }
    if (packet.t === "MESSAGE_REACTION_REMOVE") {
      client.emit(
        "messageReactionRemove",
        reaction,
        client.users.get(packet.d.user_id)
      );
    }
  });
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (
    (await setup.findOne({
      userID: user.id,
      messageID: reaction.message.id,
    })) !== null &&
    !user.bot &&
    reaction.emoji.name === "▶️"
  ) {
    const data = await setup.findOne({
      messageID: reaction.message.id,
    });
    try {
      const arr = [];
      reaction.message.reactions
        .filter((r) => r.emoji.name === "✅")
        .first()
        .users.filter((u) => !u.bot)
        .map((u) =>
          arr.push({
            id: u.id,
            allow: ["SEND_MESSAGES", "VIEW_CHANNEL", "CONNECT", "SPEAK"],
            deny: ["MANAGE_MESSAGES"],
          })
        );
      arr.push({
        id: reaction.message.guild.id,
        deny: ["VIEW_CHANNEL"],
        allow: [],
      });
      arr.push({
        id: user.id,
        allow: ["SEND_MESSAGES", "VIEW_CHANNEL", "CONNECT", "SPEAK"],
        deny: ["MANAGE_MESSAGES"],
      });
      reaction.message.guild
        .createChannel(
          `LFG-${
            reaction.message.guild.members.get(data.userID).user.username
          }`,
          {
            type: "category",
            permissionOverwrites: arr,
          }
        )
        .then(async (cat) => {
          reaction.message.guild
            .createChannel(`text-chat`, {
              type: "text",
              permissionOverwrites: arr,
            })
            .then(async (c) => {
              await c.setParent(cat.id);
              reaction.message.guild.members.get(data.userID).send(
                new RichEmbed().setColor("GREEN").setDescription(
                  `I have created your **looking for group channel** ${c.toString()} with **${
                    reaction.message.reactions
                      .filter((r) => r.emoji.name === "✅")
                      .first()
                      .users.filter((u) => !u.bot).size
                  }** other users`
                )
              );
              try {
                reaction.message.guild.channels
                  .get(data.postChannelID)
                  .fetchMessage(data.messageID)
                  .then((m) => m.delete());
              } catch (err) {}
              c.send(
                new RichEmbed()
                  .setDescription(
                    `**Welcome ${reaction.message.reactions
                      .filter((r) => r.emoji.name === "✅")
                      .first()
                      .users.filter((u) => !u.bot && u.id !== data.userID)
                      .map(
                        (u) => `${u.toString()} `
                      )} to __${reaction.message.guild.members
                      .get(data.userID)
                      .toString()}'s__ party!**\n\nIf you would like to leave please react with ❌. **If you are the party owner: reacting with ❌ will delete the channel**`
                  )
                  .setColor("GREEN")
              ).then(async (m) => {
                data.exitMessageID = m.id;
                await m.react("❌");
                data.save().catch((err) => console.log(err));
              });
            });
          reaction.message.guild
            .createChannel(`voice-chat`, {
              type: "voice",
              permissionOverwrites: arr,
            })
            .then(async (c) => {
              await c.setParent(cat.id);
            });
        });
    } catch (err) {
      console.log(err);
    }
  }

  if (
    (await setup.findOne({ exitMessageID: reaction.message.id })) !== null &&
    reaction.emoji.name === "❌" &&
    !user.bot
  ) {
    const data = await setup.findOne({
      exitMessageID: reaction.message.id,
    });
    try {
      if (
        (await setup.findOne({
          exitMessageID: reaction.message.id,
          userID: user.id,
        })) !== null
      ) {
        await reaction.message.channel.guild.channels
          .filter((c) => c.parentID === reaction.message.channel.parentID)
          .map((c) => c.delete());
        reaction.message.channel.parent.delete();
        await setup.findOneAndDelete({ userID: user.id });
      } else {
        try {
          client.users
            .get(data.userID)
            .send(`**${user.username}** has left your party!`);
        } catch (err) {}
        client.channels
          .get(reaction.message.channel.id)
          .parent.overwritePermissions(user.id, {
            VIEW_CHANNEL: false,
            SEND_MESSAGES: false,
          });
      }
    } catch (err) {}
  }

  if (
    reaction.emoji.name === "❌" &&
    !user.bot &&
    (await setup.findOne({
      userID: user.id,
      messageID: reaction.message.id,
    })) !== null
  ) {
    try {
      reaction.message.delete();
      const users = reaction.message.reactions
        .filter((r) => r.emoji.name == "❌")
        .first().users;
      users.map((u) => {
        u.send(
          `**${user.username}** has canceled a post you where interested in!`
        ).catch();
      });
    } catch (err) {}
    await setup.findOneAndDelete({
      userID: user.id,
    });
  }

  if (reaction.emoji.name !== "✅" || user.bot) return;
  const data = await setup.findOne({
    messageID: reaction.message.id,
  });
  if (data === null) return;
  if (!reaction.message.guild.members.get(data.userID))
    return setup.findOneAndDelete({ messageID: reaction.message.id });
  if (data.endAmount === data.count + 1) {
    try {
      const arr = [];
      reaction.message.reactions
        .filter((r) => r.emoji.name === "✅")
        .first()
        .users.filter((u) => !u.bot)
        .map((u) =>
          arr.push({
            id: u.id,
            allow: ["SEND_MESSAGES", "VIEW_CHANNEL", "CONNECT", "SPEAK"],
            deny: ["MANAGE_MESSAGES"],
          })
        );
      arr.push({
        id: reaction.message.guild.id,
        deny: ["VIEW_CHANNEL"],
        allow: [],
      });
      arr.push({
        id: data.userID,
        deny: [],
        allow: ["SEND_MESSAGES", "VIEW_CHANNEL", "CONNECT", "SPEAK"],
      });
      reaction.message.guild
        .createChannel(
          `LFG-${
            reaction.message.guild.members.get(data.userID).user.username
          }`,
          {
            type: "category",
            permissionOverwrites: arr,
          }
        )
        .then(async (cat) => {
          reaction.message.guild
            .createChannel(`text-chat`, {
              type: "text",
              permissionOverwrites: arr,
            })
            .then(async (c) => {
              await c.setParent(cat.id);
              reaction.message.guild.members.get(data.userID).send(
                new RichEmbed().setColor("GREEN").setDescription(
                  `I have created your **looking for group channel** ${c.toString()} with **${
                    reaction.message.reactions
                      .filter((r) => r.emoji.name === "✅")
                      .first()
                      .users.filter((u) => !u.bot).size
                  }** other users`
                )
              );
              try {
                reaction.message.guild.channels
                  .get(data.postChannelID)
                  .fetchMessage(data.messageID)
                  .then((m) => m.delete());
              } catch (err) {}
              c.send(
                new RichEmbed()
                  .setDescription(
                    `**Welcome ${reaction.message.reactions
                      .filter((r) => r.emoji.name === "✅")
                      .first()
                      .users.filter((u) => !u.bot && u.id !== data.userID)
                      .map(
                        (u) => `${u.toString()} `
                      )} to __${reaction.message.guild.members
                      .get(data.userID)
                      .toString()}'s__ party!**\n\nIf you would like to leave please react with ❌. **If you are the party owner: reacting with ❌ will delete the channel**`
                  )
                  .setColor("GREEN")
              ).then(async (m) => {
                data.exitMessageID = m.id;
                await m.react("❌");
                data.save().catch((err) => console.log(err));
              });
            });
          reaction.message.guild
            .createChannel(`voice-chat`, {
              type: "voice",
              permissionOverwrites: arr,
            })
            .then(async (c) => {
              await c.setParent(cat.id);
            });
        });
    } catch (err) {
      console.log(err);
    }
  } else {
    data.count++;
    try {
      const member = reaction.message.guild.members.get(data.userID);
      member.send(
        new RichEmbed()
          .setDescription(
            `**${user.username}** is interested in [your post](${reaction.message.url}). This post now has **${data.count}** user(s) interested!`
          )
          .setColor("GREEN")
          .setAuthor(member.user.username, member.user.displayAvatarURL)
      );
    } catch (err) {}
  }
  await data.save().catch((err) => console.log(err));
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (reaction.emoji.name !== "✅" || user.bot) return;
  const data = await setup.findOne({
    messageID: reaction.message.id,
  });
  if (data === null) return;
  if (!reaction.message.guild.members.get(data.userID))
    return setup.findOneAndDelete({ messageID: reaction.message.id });
  data.count--;
  try {
    const member = reaction.message.guild.members.get(data.userID);
    member.send(
      new RichEmbed()
        .setDescription(
          `**${user.username}** is no longer interested in [your post](${reaction.message.url}). This post now has **${data.count}** user(s) interested!`
        )
        .setColor("RED")
        .setAuthor(member.user.username, member.user.displayAvatarURL)
    );
  } catch (err) {}
  await data.save().catch((err) => console.log(err));
});

client.on("message", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const prefixMention = new RegExp(`^<@!?${client.user.id}> `);
  const prefix = msg.content.match(prefixMention)
    ? msg.content.match(prefixMention)[0]
    : client.prefix;

  if (msg.content.toLowerCase().startsWith(prefix)) {
    let [cmd, ...args] = msg.content.slice(prefix.length).trim().split(/ +/g);
    cmd.toLowerCase();

    if (cmd === "post" || cmd === "setup") {
      if (!args[0] || isNaN(args[0]))
        return msg.channel.send(
          `:x: You need to provide an amount of people to look for!`
        );
      if (!args[1])
        return msg.channel.send(
          ":x: You need to provide a description  for your post!"
        );
      msg.channel
        .send(
          `<a:generating:666019407256092673> Generating your post. Please wait...`
        )
        .then(async (m) => {
          if (msg.deletable) msg.delete();
          let data = await setup.findOne({
            userID: msg.author.id,
          });
          if (data === null)
            data = new setup({
              userID: msg.author.id,
              count: 0,
            });

          let timeout;
          let sliceNo = 1;
          if (ms(args[1])) {
            timeout = ms(args[1]);
            sliceNo = 2;
          } else timeout = 1 * 60 * 60 * 1000;

          const desc = args.slice(sliceNo).join(" ");

          data.endAmount = parseInt(args[0]);

          const embed = new RichEmbed()
            .setColor("BLUE")
            .setDescription(
              `${desc}\n\n**React with ✅ if you are interested!!**\n**The party owner can start the party with ▶️**\n**The post creator can close the post by reacting to ❌!**`
            )
            .setAuthor(
              `${msg.author.username} is looking for ${data.endAmount} player(s)!`,
              `${msg.author.displayAvatarURL}`
            )
            .setTimestamp();

          m.edit(
            `:inbox_tray: **Timeout:** ${ms(timeout, { long: true })}`,
            embed
          ).then(async (message) => {
            try {
              client.channels
                .get(data.postChannelID)
                .messages.get(data.messageID)
                .delete();
            } catch (err) {}

            data.count = 0;
            data.messageID = message.id;
            data.postChannelID = message.channel.id;
            data.desc = desc;

            await data.save().catch((err) => console.log(err));
            await message.react("✅");
            await message.react("▶️");
            await message.react("❌");

            const i = client.setInterval(() => {
              timeout -= 30 * 1000;

              if (timeout <= 1) {
                message.delete();
                client.clearInterval(i);
              }

              message.edit(
                `:inbox_tray: **Timeout:** ${ms(timeout, { long: true })}`,
                embed
              );
            }, 30 * 1000);
          });
        });
    } else if (cmd === "help" || cmd === "info") {
      msg.channel.send(
        `**This bot was created by __LFG Co__**`,
        new RichEmbed()
          .setColor("BLUE")
          .setTitle(`Commands | Prefix: ${client.prefix}`)
          .setDescription(
            `\`post [amout of players] [timeout] [description]\`: Post something to the current channel. Your previous post will be removed\n\`announce [message]\`: Announce a message\n\`report [message]\`: Report something to staff\n\`postreset\`: Reset your posts`
          )
      );
    } else if (cmd === "announce") {
      if (
        !msg.member.hasPermission("MANAGE_MESSAGES") &&
        !msg.member.hasPermission("ADMINISTRATOR")
      )
        return msg.channel.send(
          ":x: You need the `MANAGE_MESSAGES` or `ADMINISTRATOR` permissions to use that command!"
        );
      if (!args[0] && msg.attachments.szie < 1)
        return msg.channel.send(
          ":x: You need to provide a message to announce!"
        );
      if (msg.deletable) msg.delete();
      let embed = new RichEmbed()
        .setDescription(args.join(" ") || "None")
        .setColor(msg.member.highestRole.color || "BLUE")
        .setAuthor(msg.author.username, msg.author.displayAvatarURL)
        .setFooter(`A broadcasted message from LFG staff through LFGB`)
        .setTimestamp();
      if (msg.attachments.size > 0) embed.setImage(msg.attachments.first().url);
      msg.channel.send(embed);
    } else if (cmd === "report") {
      if (!args[0] && msg.attachments.size < 1)
        return msg.channel.send(
          ":x: You need to supply a message to report with!"
        );
      try {
        if (msg.deletable) msg.delete();
        let embed = new RichEmbed()
          .setAuthor(msg.author.tag, msg.author.displayAvatarURL)
          .setColor("RED")
          .addField(
            `A report from ${msg.author.username}`,
            args.join(" ") || "N/A"
          )
          .setTimestamp();
        if (msg.attachments.size > 0)
          embed.setImage(msg.attachments.first().proxyURL);
        client.channels.get("679695652179148824").send(embed);
        msg.channel.send("Your report has been submitted!");
      } catch (err) {
        console.log(err);
        msg.channel.send(
          ":x: I could not send your report! Please try again later!"
        );
      }
    } else if (cmd === "reportchannel") {
      if (!msg.mentions.channels.first())
        return msg.channel.send(
          ":x: You need to mentiona channel to send the reports to!"
        );

      const data =
        (await reports.findOne({
          guildID: msg.guild.id,
        })) ||
        new reports({
          guildID: msg.guild.id,
        });

      data.channelID = msg.mentions.channels.first().id;

      await data.save();

      msg.channel.send(
        `Set ${msg.mentions.channels.first()} as the reports channel`
      );
    } else if (cmd === "resetpost" || cmd === "postreset") {
      const data = await setup.findOne({
        userID: msg.author.id,
      });
      if (data === null)
        return msg.channel.send(":x: You do no thave any posts to reset!");
      try {
        client.channels
          .get(data.postChannelID)
          .messages.get(data.messageID)
          .delete();
      } catch (err) {}
      await data.delete();
      msg.channel.send("I have reset your posts");
    }
  }
});

client.login(process.env.TOKEN);
