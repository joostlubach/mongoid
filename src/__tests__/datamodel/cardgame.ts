import { MongoClient } from 'mongodb'

import ModelBackend from '../../backend/ModelBackend'
import { model } from '../../registry'
import { array, string } from '../../types'
import { ref } from '../../types/ref'
import { TypedModel } from '../../typings'

const roomSchema = {
  cascadeGame:   ref({model: 'Game', required: false, onDelete: 'cascade'}),
  mandatoryGame: ref({model: 'Game', required: false, onDelete: 'disallow'}),
}

const gameSchema = {
  players: array({
    // When a player is deleted, it is removed from the array of players.
    itemType: ref<Player>({model: 'Player', onDelete: 'unset'}),
  }),

  // When a game leader is deleted, all of their games are removed as well.
  cascadeLeader: ref<Player>({model: 'Player', required: false, onDelete: 'cascade'}),

  // This property uses a delete strategy.
  deleteLeader: ref<Player>({model: 'Player', required: false, onDelete: 'delete'}),

  deck: array({
    // Remove cards from the deck if they are deleted.
    // When a game is deleted, delete all cards as well.
    itemType: ref<Card>({model: 'Card', onDelete: 'unset', cascadeDelete: true}),
  }),
}

const playerSchema = {
  name: string(),

  hand: array({
    itemType: ref({model: 'Card', onDelete: 'unset'}),
    default:  () => [],
  }),

  // This card will be set to `null` if the card is removed.
  unsetOptionalCard: ref({model: 'Card', required: false, onDelete: 'unset'}),

  // The lowest card may be removed, and the reference will become invalid.
  ignoredCard: ref({model: 'Card', required: false, onDelete: 'ignore'}),

  // The default option is `unset`, but this card is required.
  unsetRequiredCard: ref({model: 'Card', required: true}),

  // This card may not be removed.
  mandatoryCard: ref({model: 'Card', required: false, onDelete: 'disallow'}),

  // This card has custom rules (which are set in the tests).
  customCard: ref({model: 'Card', required: false}),
}

const cardSchema = {
  game:  ref({model: 'Game', required: false, onDelete: 'cascade'}),
  suit:  string({enum: ['♦', '♣', '♠', '♥']}),
  value: string({enum: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']}),
}

@model<Game>('Game', {schema: gameSchema})
export class Game extends TypedModel(gameSchema) {

  public card(id: string) {
    return this.deck.find(it => it.id === id)
  }

}

@model<Room>('Room', {schema: roomSchema})
export class Room extends TypedModel(roomSchema) {
}

@model<Player>('Player', {schema: playerSchema})
export class Player extends TypedModel(playerSchema) {
}

@model<Card>('Card', {schema: cardSchema})
export class Card extends TypedModel(cardSchema) {
}

export async function createGame(client: MongoClient, attributes: Record<string, any> = {}) {
  const games = new ModelBackend(client, Game)
  const players = new ModelBackend(client, Player)

  const deck = await buildDeck(client)

  const alice = await players.ensure({id: 'alice'}, {name: "Alice", unsetRequiredCard: '♦A'})
  const bob = await players.ensure({id: 'bob'}, {name: "Bob", unsetRequiredCard: '♦A'})
  const charlie = await players.ensure({id: 'charlie'}, {name: "Charlie", unsetRequiredCard: '♦A'})
  const dolores = await players.ensure({id: 'dolores'}, {name: "Dolores", unsetRequiredCard: '♦A'})

  const id = attributes.cascadeLeader ?? attributes.deleteLeader ?? 'alice'

  return await games.create({
    id,
    players: [alice, bob, charlie, dolores],
    deck,
    ...attributes,
  })
}

export async function buildDeck(client: MongoClient) {
  const cards = new ModelBackend(client, Card)

  const deck = await cards.query().run().toArray()
  if (deck.length > 0) { return deck }

  const attributes: Record<string, any>[] = []
  for (const suit of ['♦']) {
    for (const value of ['10', 'J', 'Q', 'K', 'A']) {
      const id = `${suit}${value}`
      attributes.push({id, suit, value})
    }
  }

  return await cards.createMany(attributes)
}

export function deckIDs() {
  const ids: string[] = []
  for (const suit of ['♦']) {
    for (const value of ['10', 'J', 'Q', 'K', 'A']) {
      ids.push(`${suit}${value}`)
    }
  }

  return ids
}

// ♦♣♠♥