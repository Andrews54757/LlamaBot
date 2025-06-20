import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder, UserSelectMenuInteraction } from "discord.js";
import { GuildHolder } from "../../GuildHolder.js";
import { Menu } from "../../interface/Menu.js";
import { canEditSubmission, replyEphemeral } from "../../utils/Util.js";
import { Author, AuthorType } from "../../submissions/Author.js";
import { Submission } from "../../submissions/Submission.js";
import { SubmissionConfigs } from "../../submissions/SubmissionConfigs.js";
import { SetArchiveCategoryMenu } from "./SetArchiveCategoryMenu.js";

export class SetAuthorsMenu implements Menu {
    getID(): string {
        return "set-authors-menu";
    }

    async getBuilder(guildHolder: GuildHolder, submission: Submission, isExtra: boolean): Promise<UserSelectMenuBuilder | StringSelectMenuBuilder> {
        const currentAuthors = (submission.getConfigManager().getConfig(SubmissionConfigs.AUTHORS) || []).filter(author => {
            if (author.type === AuthorType.Unknown || author.type === AuthorType.DiscordDeleted) {
                return isExtra;
            } else {
                return !isExtra;
            }
        });

        if (isExtra) {
            const userSize = currentAuthors.length;
            return new StringSelectMenuBuilder()
                .setCustomId(this.getID() + "|e")
                .setMinValues(0)
                .setMaxValues(Math.min(userSize, 25))
                .setPlaceholder('Select authors')
                .setOptions(currentAuthors.map(author => {
                    const opt = new StringSelectMenuOptionBuilder();
                    opt.setLabel(author.displayName || author.username || 'Unknown Author');
                    opt.setValue(author.username || 'unknown-author');
                    opt.setDefault(currentAuthors.some(a => a.username === author.username));
                    return opt;
                }))
        } else {
            // get list of users
            const userSize = Math.max(guildHolder.getGuild().members.cache.size, currentAuthors.length);
            return new UserSelectMenuBuilder()
                .setCustomId(this.getID() + "|d")
                .setMinValues(0)
                .setMaxValues(Math.min(userSize, 25))
                .setPlaceholder('Select authors')
                .setDefaultUsers(currentAuthors.map(author => author.id || '').filter(id => !!id))
        }
    }

    async execute(guildHolder: GuildHolder, interaction: UserSelectMenuInteraction, extra: string): Promise<void> {
        const isExtra = extra === 'e';
        if (isExtra) {
            return this.executeExtra(guildHolder, interaction);
        } else {
            return this.executeDiscord(guildHolder, interaction);
        }
    }

    async executeDiscord(guildHolder: GuildHolder, interaction: UserSelectMenuInteraction): Promise<void> {
        const submissionId = interaction.channelId
        const submission = await guildHolder.getSubmissionsManager().getSubmission(submissionId)
        if (!submission) {
            replyEphemeral(interaction, 'Submission not found')
            return
        }

        if (!canEditSubmission(interaction, submission)) {
            replyEphemeral(interaction, 'You do not have permission to use this menu!');
            return;
        }

        const isFirstTime = submission.getConfigManager().getConfig(SubmissionConfigs.AUTHORS) === null;
        const currentAuthors = submission.getConfigManager().getConfig(SubmissionConfigs.AUTHORS) || [];

        const newAuthors = (await Promise.all(interaction.values.map(async (id) => {
            let user = await guildHolder.getGuild().members.fetch(id).catch(() => null);
            if (!user) {
                const current = currentAuthors.find(a => a.id === id);
                if (current) {
                    return current; // Keep the current author if the user is not found
                } else {
                    return null;
                }
            }
            return {
                type: AuthorType.DiscordInGuild,
                id: user.id,
                name: user.user.username,
                displayName: user.displayName,
                iconURL: user.displayAvatarURL()
            }
        }))).filter(author => author !== null) as Author[];

        const added: Author[] = [];
        const removed: Author[] = [];
        for (const author of newAuthors) {
            if (!currentAuthors.some(a => a.id === author.id)) {
                added.push(author);
            }
        }

        for (const author of currentAuthors) {
            if (author.type !== AuthorType.Unknown && !newAuthors.some(a => a.id === author.id)) {
                removed.push(author);
            }
        }

        if (added.length === 0 && removed.length === 0) {
            replyEphemeral(interaction, 'No changes made to authors');
            return;
        }

        added.forEach(author => {
            currentAuthors.push(author);
        });
        removed.forEach(author => {
            const index = currentAuthors.findIndex(a => a.id === author.id);
            if (index !== -1) {
                currentAuthors.splice(index, 1);
            }
        });

        submission.getConfigManager().setConfig(SubmissionConfigs.AUTHORS, currentAuthors);

        const str = [];
        if (added.length) {
            str.push('added ' + added.map(a => `<@${a.id}>`).join(', '));
        }
        if (removed.length) {
            str.push('removed ' + removed.map(a => `<@${a.id}>`).join(', '));
        }

        if (str.length) {
            await interaction.reply({
                content: `<@${interaction.user.id}> ${str.join(' and ')} to authors`,
                flags: [MessageFlags.SuppressNotifications]
            });
            await submission.statusUpdated()
        }

        if (isFirstTime) {
            const row = new ActionRowBuilder()
                .addComponents(await new SetArchiveCategoryMenu().getBuilder(guildHolder))
            await interaction.followUp({
                content: `Please select an archive category for your submission`,
                components: [row as any],
                flags: MessageFlags.Ephemeral
            })
        }

        submission.checkReview()
    }


    async executeExtra(guildHolder: GuildHolder, interaction: UserSelectMenuInteraction): Promise<void> {
        const submissionId = interaction.channelId
        const submission = await guildHolder.getSubmissionsManager().getSubmission(submissionId)
        if (!submission) {
            replyEphemeral(interaction, 'Submission not found')
            return
        }

        if (!canEditSubmission(interaction, submission)) {
            replyEphemeral(interaction, 'You do not have permission to use this menu!');
            return;
        }

        const isFirstTime = submission.getConfigManager().getConfig(SubmissionConfigs.AUTHORS) === null;
        const currentAuthors = submission.getConfigManager().getConfig(SubmissionConfigs.AUTHORS) || [];

        const newAuthors = (await Promise.all(interaction.values.map(async (name) => {
            const existingAuthor = currentAuthors.find(a => a.type === AuthorType.Unknown && a.username === name);
            return existingAuthor || {
                type: AuthorType.Unknown,
                id: null, // No ID for unknown authors
                name: name
            }
        }))).filter(author => author !== null) as Author[];

        const added: Author[] = [];
        const removed: Author[] = [];

        for (const author of newAuthors) {
            if (!currentAuthors.some(a => a.type === AuthorType.Unknown && a.username === author.username)) {
                added.push(author);
            }
        }

        for (const author of currentAuthors) {
            if (author.type === AuthorType.Unknown && !newAuthors.some(a => a.username === author.username)) {
                removed.push(author);
            }
        }

        if (added.length === 0 && removed.length === 0) {
            replyEphemeral(interaction, 'No changes made to authors');
            return;
        }

       added.forEach(author => {
            currentAuthors.push(author);
        });
        removed.forEach(author => {
            const index = currentAuthors.findIndex(a => a.type === AuthorType.Unknown && a.username === author.username);
            if (index !== -1) {
                currentAuthors.splice(index, 1);
            }
        });

        submission.getConfigManager().setConfig(SubmissionConfigs.AUTHORS, currentAuthors);

        const str = [];
        if (added.length) {
            str.push('added ' + added.map(a => a.username).join(', '));
        }
        if (removed.length) {
            str.push('removed ' + removed.map(a => a.username).join(', '));
        }

        if (str.length) {
            await interaction.reply({
                content: `<@${interaction.user.id}> ${str.join(' and ')} to authors`,
                flags: [MessageFlags.SuppressNotifications]
            });
            await submission.statusUpdated()
        }

        if (isFirstTime) {
            const row = new ActionRowBuilder()
                .addComponents(await new SetArchiveCategoryMenu().getBuilder(guildHolder))
            await interaction.followUp({
                content: `Please select an archive category for your submission`,
                components: [row as any],
                flags: MessageFlags.Ephemeral
            })
        }

        submission.checkReview()
    }

}