import { Model, ModelClass, Query } from '../src'

describe("Query", () => {

  let TestModel: ModelClass<any>

  beforeEach(() => {
    TestModel = class TestModel extends Model {}
  })

  it("should be a Query", async () => {
    const query = new Query(TestModel)
    expect(query).toBeInstanceOf(Query)
  })

})