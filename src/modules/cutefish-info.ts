import client from '../client';
import { Events, Message } from 'discord.js';

const CUTEFISH_MESSAGE = `Ok, wisten up, you! Cutefish used to be part of Ultramarine, until the devewoper just weft, cwosed the website, and weft the GitHub. There's no wevival of Cutefish that wasts wong, and we won't mantain it. If you can pwove to use that a wevival of Cutefish will wast wong, we'll think about it. Now scoot!
Sowwy if you were just saying the word in nowmal convewsation. Keep gowing :3`

const containsWord = (msg: Message, word: string): boolean => {
  const matches = msg.content.match(new RegExp(`\\b${word}\\b`, 'i'));
  return matches != null && matches.length > 0;
};

client.on(Events.MessageCreate, async (message) => {
  if (containsWord(message, 'cutefish')) {
    await message.react(CUTEFISH_MESSAGE);
  }
});
