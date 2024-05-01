import { MongoClient } from 'mongodb'
import { expectAsyncError } from 'yest'

import InvalidModelError from '../InvalidModelError'
import { ModelBackend, ReferentialIntegrity } from '../backend'
import { ReferentialIntegrityError } from '../backend/ReferentialIntegrity'
import { testClient } from './client'
import { Card, createGame, deckIDs, Game, Player, Room } from './datamodel/cardgame'

let client: MongoClient
let game: Game

let rooms: ModelBackend<Room>
let games: ModelBackend<Game>
let players: ModelBackend<Player>
let cards: ModelBackend<Card>

beforeEach(async () => {
  client = await testClient()
  game = await createGame(client)

  rooms = new ModelBackend(client, Room)
  games = new ModelBackend(client, Game)
  players = new ModelBackend(client, Player)
  cards = new ModelBackend(client, Card)
})

describe("collecting references", () => {

  beforeEach(async () => {
    await games.update(game, {
      cascadeLeader: 'alice',
      deleteLeader:  'alice',
    })
  })

  it("should correctly collect references from the models", async () => {
    const refint = new ReferentialIntegrity(client)
    expect(refint.collectReferences(game)).toEqual([
      {path: 'players.0', model: 'Player', id: 'alice', strategy: 'other'},
      {path: 'players.1', model: 'Player', id: 'bob', strategy: 'other'},
      {path: 'players.2', model: 'Player', id: 'charlie', strategy: 'other'},
      {path: 'players.3', model: 'Player', id: 'dolores', strategy: 'other'},

      {path: 'cascadeLeader', model: 'Player', id: 'alice', strategy: 'cascade'},
      {path: 'deleteLeader', model: 'Player', id: 'alice', strategy: 'delete'},

      ...deckIDs().map((id, idx) => ({path: `deck.${idx}`, model: 'Card', id, strategy: 'other'})),
    ])
  })

  it("should store those references in the database under the _references key", async () => {
    const document = await client.db().collection('games').findOne({_id: game.id as any})
    expect(document!._references).toEqual([
      {path: 'players.0', model: 'Player', id: 'alice', strategy: 'other'},
      {path: 'players.1', model: 'Player', id: 'bob', strategy: 'other'},
      {path: 'players.2', model: 'Player', id: 'charlie', strategy: 'other'},
      {path: 'players.3', model: 'Player', id: 'dolores', strategy: 'other'},

      {path: 'cascadeLeader', model: 'Player', id: 'alice', strategy: 'cascade'},
      {path: 'deleteLeader', model: 'Player', id: 'alice', strategy: 'delete'},

      ...deckIDs().map((id, idx) => ({path: `deck.${idx}`, model: 'Card', id, strategy: 'other'})),
    ])
  })

  it("should denotate any other strategy than cascade or delete as 'other'", async () => {
    const alice = await players.update('alice', {
      hand:              ['♦A', '♦K'],
      unsetOptionalCard: '♦A',
    })

    const refint = new ReferentialIntegrity(client)
    expect(refint.collectReferences(alice!)).toEqual([
      {path: 'hand.0', model: 'Card', id: '♦A', strategy: 'other'},
      {path: 'hand.1', model: 'Card', id: '♦K', strategy: 'other'},
      {path: 'unsetOptionalCard', model: 'Card', id: '♦A', strategy: 'other'},
      {path: 'unsetRequiredCard', model: 'Card', id: '♦A', strategy: 'other'},
    ])
  })

  it("should not include any references with a strategy 'ignore'", async () => {
    const alice = await players.update('alice', {ignoredCard: '♦1'})

    const refint = new ReferentialIntegrity(client)
    expect(refint.collectReferences(alice!)).toEqual([
      {path: 'unsetRequiredCard', model: 'Card', id: '♦A', strategy: 'other'},
    ])
  })

})

describe("deletion", () => {

  describe("strategy 'disallow'", () => {

    it("should throw an error on the deletion", async () => {
      await players.update('bob', {
        mandatoryCard: '♦10',
      })

      await expectAsyncError(
        () => cards.delete('♦10'),
        ReferentialIntegrityError,
        error => {
          expect(error.affectedModels).toHaveLength(1)
          expect(error.affectedModels[0].Model).toBe(Player)
          expect(error.affectedModels[0].id).toEqual('bob')
          expect(error.affectedModels[0].references).toEqual([
            {path: 'mandatoryCard', model: 'Card', id: '♦10', strategy: 'disallow'},
          ])
        }
      )
    })

  })

  describe("strategy 'cascade'", () => {

    beforeEach(async () => {
      await games.update(game.id, {cascadeLeader: 'alice'})
    })

    it("should delete the referencing object, but leave other models of the same type alone", async () => {
      // Create another game,  but make Bob leader.
      const bobsGame = await createGame(client, {cascadeLeader: 'bob'})

      // Delete Alice.
      await players.delete('alice')

      // Observe that only Bob's game remains.
      const ids = await games.query().pluck('id')
      expect(ids).toEqual([bobsGame.id])
    })

    it("should cascade delete all objects that have a reference to the referencing object", async () => {
      // Create room.
      const rooms = new ModelBackend(client, Room)
      await rooms.create({cascadeGame: game})

      // Delete Alice.
      await players.delete('alice')

      // Observe that because the game has been removed, also the room will be removed.
      const ids = await rooms.query().pluck('id')
      expect(ids).toEqual([])
    })

    it("should not allow deletion if the referencing object has a ref to it with strategy 'disallow'", async () => {
      // Create room.
      const rooms = new ModelBackend(client, Room)
      const room = await rooms.create({mandatoryGame: game})

      // Observe that we cannot delete Alice.
      await expectAsyncError(
        () => players.delete('alice'),
        ReferentialIntegrityError,
        error => {
          expect(error.affectedModels).toHaveLength(1)
          expect(error.affectedModels[0].Model).toBe(Room)
          expect(error.affectedModels[0].id).toEqual(room.id)
          expect(error.affectedModels[0].references).toEqual([
            {path: 'mandatoryGame', model: 'Game', id: game.id, strategy: 'disallow'},
          ])
        }
      )
    })

  })

  describe("strategy 'delete'", () => {

    beforeEach(async () => {
      await games.update(game.id, {deleteLeader: 'alice'})
    })
    
    it("should delete the referencing object, but leave other models of the same type alone", async () => {
      // Create another game,  but make Bob leader.
      const bobsGame = await createGame(client, {deleteLeader: 'bob'})

      // Delete Alice.
      await players.delete('alice')

      // Observe that only Bob's game remains.
      const ids = await games.query().pluck('id')
      expect(ids).toEqual([bobsGame.id])
    })

    it("should not cascade delete all objects that have a reference to the referencing object", async () => {
      // Create room.
      const rooms = new ModelBackend(client, Room)
      const room = await rooms.create({cascadeGame: game})

      // Delete Alice.
      await players.delete('alice')

      // Observe that because the game has been removed, also the room will be removed.
      const ids = await rooms.query().pluck('id')
      expect(ids).toEqual([room.id])
    })

    it("should allow deletion if the referencing object has a ref to it with strategy 'disallow'", async () => {
      // Create room.
      const rooms = new ModelBackend(client, Room)
      const room = await rooms.create({mandatoryGame: game})

      // Observe that we cannot delete Alice.
      await players.delete('alice')

      // Observe that because the game has been removed, also the room will be removed.
      const ids = await rooms.query().pluck('id')
      expect(ids).toEqual([room.id])
    })

  })

  describe("strategy 'unset'", () => {

    it("should set the ref value to `null` in the case of a single ref", async () => {
      await players.update('alice', {unsetOptionalCard: '♦10'})
      await cards.delete('♦10')

      const alice = await players.query().get('alice')
      expect(alice!.unsetOptionalCard).toBeNull()
    })

    it("should throw an error if the property was required", async () => {
      await players.update('alice', {unsetRequiredCard: '♦10'})

      await expectAsyncError(
        () => cards.delete('♦10'),
        InvalidModelError,
        error => {
          expect(error.errors).toEqual([{
            path:    'unsetRequiredCard',
            code:    'required',
            message: expect.any(String),
          }])
        }
      )
    })

    it("should remove the ref value from the array in case of a ref array", async () => {
      // The `hand` property has an onDelete strategy of `unset`.
      await players.update('alice', {
        hand: ['♦A', '♦K', '♦Q'],
      })
      await cards.delete('♦K')

      const alice = await players.query().get('alice')
      expect(alice!.hand.map(card => card.id)).toEqual([
        '♦A',
        '♦Q',
      ])
    })

  })

  describe("strategy {$set}", () => {

    it("should set the ref value to the specified value", async () => {
      Player.meta.schemas[0].customCard.options.onDelete = {$set: '♦Q'}

      await players.update('alice', {customCard: '♦K'})
      await cards.delete('♦K')

      const alice = await players.query().get('alice')
      expect(alice!.customCard?.id).toEqual('♦Q')
    })

  })

  describe("custom strategy", () => {

    it("should invoke the custom strategy callback on the player object", async () => {
      Player.meta.schemas[0].customCard.options.onDelete = async (player: Player) => {
        player.assign({
          customCard: player.hand[0],
        })
      }

      await players.update('alice', {
        hand:       ['♦2', '♦J'],
        customCard: '♦K',
      })

      await cards.delete('♦K')

      const alice = await players.query().get('alice')
      expect(alice!.customCard?.id).toEqual('♦2')
    })

  })

})