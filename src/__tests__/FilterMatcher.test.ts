import FilterMatcher from '../FilterMatcher.js'

describe("FilterMatcher", () => {
  it("should match simple filters", () => {
    expect(matches({}, {})).toBe(true)
    expect(matches({a: 1}, {})).toBe(true)
    expect(matches({
      num:  1,
      str:  'foo',
      date: new Date(2023, 9, 13, 13, 0, 0),
      bool: true,
    }, {
      num:  1,
      str:  'foo',
      date: new Date(2023, 9, 13, 13, 0, 0),
      bool: true,
    })).toBe(true)
  })

  it("should fail to match in simple cases", () => {
    expect(matches({}, {a: 1})).toBe(false)
    expect(matches({a: 1}, {a: '1'})).toBe(false)
    expect(matches({a: 1}, {a: 2})).toBe(false)
    expect(matches({a: 1}, {b: 1})).toBe(false)
    expect(matches({a: true}, {b: false})).toBe(false)
    expect(matches({a: 'foo'}, {a: Symbol('foo')})).toBe(false)
  })

  it("should not allow mixing LHS and RHS matchers", () => {
    expect(() => matches({}, {a: 1, $and: []})).toThrow()
  })

  describe("arrays", () => {
    it("should do an exact array comparison if both value and condition are arrays", () => {
      expect(matches({arr: [1, 'foo', true]}, {arr: [1, 'foo', true]})).toBe(true)
      expect(matches({arr: [1, 'foo', true]}, {arr: [2, 'foo', true]})).toBe(false)
      expect(matches({arr: [1, 'foo', true]}, {arr: [1, 'bar', true]})).toBe(false)
      expect(matches({arr: [1, 'foo', true]}, {arr: [1, 'foo', false]})).toBe(false)
      expect(matches({arr: [1, 'foo', true]}, {arr: ['foo', 1, true]})).toBe(false)
    })

    it("should interpret as $elemMatch if the condition is not an array", () => {
      // expect(matches({arr: [1, 'foo', true]}, {arr: 1})).toBe(true)
      // expect(matches({arr: [1, 'foo', true]}, {arr: 'foo'})).toBe(true)
      // expect(matches({arr: [1, 'foo', true]}, {arr: true})).toBe(true)
      expect(matches({arr: [1, 'foo', true]}, {arr: {$in: [1, 'foo', true]}})).toBe(true)
      expect(matches({arr: [1, 'foo', true]}, {arr: {$in: [1, true, 'foo']}})).toBe(true)
    })
  })

  describe("top-level matchers", () => {
    test("$not", () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(matches(doc, {$not: {a: 2}})).toBe(true)
      expect(matches(doc, {$not: {a: 1}})).toBe(false)
    })

    test("$and", () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(matches(doc, {$and: [{a: 1}, {b: 2}]})).toBe(true)
      expect(matches(doc, {$and: [{a: 1}, {b: 3}]})).toBe(false)
      expect(matches(doc, {$and: [{a: 2}, {b: 3}]})).toBe(false)
    })

    test("$nand", () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(matches(doc, {$nand: [{a: 1}, {b: 2}]})).toBe(false)
      expect(matches(doc, {$nand: [{a: 1}, {b: 3}]})).toBe(true)
      expect(matches(doc, {$nand: [{a: 2}, {b: 3}]})).toBe(true)
    })

    test("$or", () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(matches(doc, {$or: [{a: 1}, {b: 2}]})).toBe(true)
      expect(matches(doc, {$or: [{a: 1}, {b: 3}]})).toBe(true)
      expect(matches(doc, {$or: [{a: 2}, {b: 3}]})).toBe(false)
    })

    test("$nor", () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(matches(doc, {$nor: [{a: 1}, {b: 2}]})).toBe(false)
      expect(matches(doc, {$nor: [{a: 1}, {b: 3}]})).toBe(false)
      expect(matches(doc, {$nor: [{a: 2}, {b: 3}]})).toBe(true)
    })

    test.todo('$expr')
  })

  describe("value matchers", () => {
    test('$cb', () => {
      const doc = {a: 1}
      expect(matches(doc, {a: {$cb: (val: any) => val === 1}})).toBe(true)
      expect(matches(doc, {a: {$cb: (val: any) => val !== 1}})).toBe(false)
    })

    describe.each`
      operator    | inverted
      ${'$eq'}    | ${false}
      ${'$equal'} | ${false}
      ${'$ne'}    | ${true}
    `('$operator', ({operator, inverted}) => {
      const TRUE = !inverted
      const FALSE = !!inverted

      it("should match exact values", () => {
        expect(matches({a: 1}, {a: {[operator]: 1}})).toBe(TRUE)
        expect(matches({a: 1}, {a: {[operator]: 2}})).toBe(FALSE)
        expect(matches({a: 1}, {a: {[operator]: '1'}})).toBe(FALSE)
      })

      if (operator !== '$ne') {
        // TODO: Fix this

        it("should match arrays", () => {
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: [1, 2, 3]}})).toBe(TRUE)
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: [1, 3, 3]}})).toBe(FALSE)
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: [1, 3, 2]}})).toBe(FALSE)
        })

        it("should match individual array elements as well", () => {
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: 2}})).toBe(TRUE)
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: 3}})).toBe(TRUE)
          expect(matches({a: [1, 2, 3]}, {a: {[operator]: 4}})).toBe(FALSE)
        })
      }

      it("should match objects", () => {
        expect(matches({a: {b: 1}}, {a: {[operator]: {b: 1}}})).toBe(TRUE)
        expect(matches({a: {b: 1}}, {a: {[operator]: {b: 2}}})).toBe(FALSE)
        expect(matches({a: {b: 1}}, {a: {[operator]: {b: 1, c: 2}}})).toBe(FALSE)
      })

      it("should match dates", () => {
        const now1 = new Date(2023, 9, 13, 13, 0)
        const now2 = new Date(2023, 9, 13, 13, 0)
        const later = new Date(2023, 9, 13, 13, 1)

        expect(matches({a: now1}, {a: {[operator]: now1}})).toBe(TRUE)
        expect(matches({a: now1}, {a: {[operator]: now1.getTime()}})).toBe(TRUE)
        expect(matches({a: now1}, {a: {[operator]: now1.toISOString()}})).toBe(TRUE)
        expect(matches({a: now1}, {a: {[operator]: now2}})).toBe(TRUE)
        expect(matches({a: now1}, {a: {[operator]: later}})).toBe(FALSE)
      })
    })

    test("$eq should be value matcher without operator", () => {
      const now1 = new Date(2023, 9, 13, 13, 0)
      const now2 = new Date(2023, 9, 13, 13, 0)
      const later = new Date(2023, 9, 13, 13, 1)

      expect(matches({a: 1}, {a: 1})).toBe(true)
      expect(matches({a: 1}, {a: 2})).toBe(false)
      expect(matches({a: 1}, {a: '1'})).toBe(false)
      expect(matches({a: [1, 2, 3]}, {a: [1, 2, 3]})).toBe(true)
      expect(matches({a: [1, 2, 3]}, {a: [1, 3, 3]})).toBe(false)
      expect(matches({a: [1, 2, 3]}, {a: [1, 3, 2]})).toBe(false)
      expect(matches({a: {b: 1}}, {a: {b: 1}})).toBe(true)
      expect(matches({a: {b: 1}}, {a: {b: 2}})).toBe(false)
      expect(matches({a: {b: 1}}, {a: {b: 1, c: 2}})).toBe(false)
      expect(matches({a: now1}, {a: now1})).toBe(true)
      expect(matches({a: now1}, {a: now1.getTime()})).toBe(true)
      expect(matches({a: now1}, {a: now1.toISOString()})).toBe(true)
      expect(matches({a: now1}, {a: now2})).toBe(true)
      expect(matches({a: now1}, {a: later})).toBe(false)
    })

    test('$exists', () => {
      // It should match if a field exists and is not undefined. MongoDB converts all explicit
      // `undefined`s to `null`s so we correspond to MongoDB.
      expect(matches({
        a: 1,
        b: null,
        c: undefined,
      }, {
        a: {$exists: true},
        b: {$exists: true},
        c: {$exists: false},
        d: {$exists: false},
      })).toBe(true)

      expect(matches({
        a: 1,
        b: null,
        c: undefined,
      }, {
        $or: [
          {a: {$exists: false}},
          {b: {$exists: false}},
          {c: {$exists: true}},
          {d: {$exists: true}},
        ],
      })).toBe(false)
    })

    test('$elemMatch', () => {
      expect(() => matches({a: [1, 2, 3]}, {a: {$elemMatch: 1}})).toThrow()
      expect(() => matches({a: [1, 2, 3]}, {a: {$elemMatch: [1, 2, 3]}})).toThrow()

      expect(matches({a: [{a: 1}, {a: 2}, {a: 3}]}, {a: {$elemMatch: {a: 2}}})).toBe(true)
      expect(matches({a: [{a: 1}, {a: 2}, {a: 3}]}, {a: {$elemMatch: {a: 4}}})).toBe(false)
    })

    test('$in', () => {
      expect(matches({a: 1}, {a: {$in: [1, 2, 3]}})).toBe(true)
      expect(matches({a: 2}, {a: {$in: [1, 3]}})).toBe(false)
    })

    test('$nin', () => {
      expect(matches({a: 1}, {a: {$nin: [1, 2, 3]}})).toBe(false)
      expect(matches({a: 2}, {a: {$nin: [1, 3]}})).toBe(true)
    })

    test.todo('$lt')
    test.todo('$gt')
    test.todo('$lte')
    test.todo('$gte')
    test.todo('$between')
    test.todo('$before')
    test.todo('$after')

    test.todo('$deepEquals')
    test.todo('$not')
    test.todo('$nor')
    test.todo('$and')
    test.todo('$or')
    test.todo('$null')
    test.todo('$likeI')
    test.todo('$like')
    test.todo('$startsWith')
    test.todo('$endsWith')
    test.todo('$contains')
    test.todo('$regex')
    test.todo('$type')
    test.todo('$size')
    test.todo('$mod')
    test.todo('$equal')
  })

  function matches(obj: any, filters: Record<string, any>) {
    const tester = new FilterMatcher(filters)
    return tester.matches(obj)
  }
})
