const stores = new Map()
const failNextAdds = new Set()

const clone = (value) => structuredClone(value)
const storeFor = (name) => {
  if (!stores.has(name)) stores.set(name, new Map())
  return stores.get(name)
}

const command = {
  neq: (value) => ({ __op: 'neq', value }),
  in: (value) => ({ __op: 'in', value }),
}

const isOperator = (value) => value && typeof value === 'object' && '__op' in value
const matchesValue = (actual, expected) => {
  if (!isOperator(expected)) return actual === expected
  if (expected.__op === 'neq') return actual !== expected.value
  if (expected.__op === 'in') return expected.value.includes(actual)
  return false
}
const matches = (document, where) => Object.entries(where).every(([key, expected]) => matchesValue(document[key], expected))

class DocumentReference {
  constructor(name, id) { this.name = name; this.id = id }
  async get() { return { data: clone(storeFor(this.name).get(this.id) || null) } }
  async set({ data }) {
    if (Object.hasOwn(data, '_id')) throw new Error('The _id field cannot be modified')
    storeFor(this.name).set(this.id, clone({ ...data, _id: this.id }))
    return { _id: this.id }
  }
  async update({ data }) {
    const current = storeFor(this.name).get(this.id)
    if (!current) throw new Error(`Document not found: ${this.name}/${this.id}`)
    storeFor(this.name).set(this.id, clone({ ...current, ...data, _id: this.id }))
    return { updated: 1 }
  }
  async remove() { return { removed: storeFor(this.name).delete(this.id) ? 1 : 0 } }
}

class Query {
  constructor(name, where = {}) { this.name = name; this.whereValue = where; this.limitValue = Infinity; this.skipValue = 0; this.order = null; this.fields = null }
  where(where) { this.whereValue = where; return this }
  orderBy(field, direction) { this.order = { field, direction }; return this }
  limit(value) { this.limitValue = value; return this }
  skip(value) { this.skipValue = value; return this }
  field(fields) { this.fields = fields; return this }
  select() {
    let result = [...storeFor(this.name).values()].filter((document) => matches(document, this.whereValue))
    if (this.order) {
      const { field, direction } = this.order
      result.sort((left, right) => {
        const a = left[field] instanceof Date ? left[field].getTime() : left[field]
        const b = right[field] instanceof Date ? right[field].getTime() : right[field]
        if (a === b) return 0
        const comparison = a > b ? 1 : -1
        return direction === 'desc' ? -comparison : comparison
      })
    }
    result = result.slice(this.skipValue, this.skipValue + this.limitValue)
    if (this.fields) {
      const included = Object.entries(this.fields).filter(([, enabled]) => enabled).map(([field]) => field)
      result = result.map((document) => Object.fromEntries(included.filter((field) => field in document).map((field) => [field, document[field]])))
    }
    return result
  }
  async get() { return { data: clone(this.select()) } }
  async update({ data }) {
    const selected = this.select()
    for (const document of selected) storeFor(this.name).set(document._id, clone({ ...document, ...data }))
    return { updated: selected.length }
  }
  async remove() {
    const selected = this.select()
    for (const document of selected) storeFor(this.name).delete(document._id)
    return { removed: selected.length }
  }
}

class CollectionReference extends Query {
  constructor(name) { super(name) }
  doc(id) { return new DocumentReference(this.name, id) }
  async add({ data }) {
    if (failNextAdds.delete(this.name)) throw new Error(`Injected add failure: ${this.name}`)
    const id = data._id || `auto_${Date.now()}_${Math.random().toString(16).slice(2)}`
    storeFor(this.name).set(id, clone({ ...data, _id: id }))
    return { _id: id }
  }
}

const database = {
  command,
  serverDate: () => new Date(),
  collection: (name) => new CollectionReference(name),
  async runTransaction(handler) {
    return handler({ collection: (name) => new CollectionReference(name) })
  },
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: Symbol('CURRENT_ENV'),
  init() {},
  database: () => database,
  currentOpenId: 'user-a',
  getWXContext() { return { OPENID: this.currentOpenId, APPID: 'test-appid', UNIONID: '' } },
  openapi: { security: { msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }) } },
  async deleteFile() { return { fileList: [] } },
  reset() { stores.clear(); failNextAdds.clear(); this.currentOpenId = 'user-a' },
  failNextAdd(name) { failNextAdds.add(name) },
  dump(name) { return [...storeFor(name).values()].map(clone) },
}

module.exports = fakeCloud
