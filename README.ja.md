# nostr-mux

`nostr-mux`はNostrクライアント向けのコネクション管理パッケージです。

## サンプルコード

```js
import { Mux, Relay } from 'nostr-mux';

// Muxにより複数のリレーへの接続を透過的に扱います
const mux = new Mux();

mux.addRelay(new Relay('wss://relay.snort.social'));
mux.addRelay(new Relay('wss://relay.damus.io'));

const now = Math.floor(Date.now() / 1000);

// ここでは waitRelayBecomesHealthy を使い、
// 最低1つのリレーに繋がっていることを2秒のタイムアウト付きで確認した後、
// イベントの取得を開始しています。
mux.waitRelayBecomesHealthy(1, 2000)
  .then(ok => {
    if (!ok) {
      console.error('no connected relays');
      return;
    }

    mux.subscribe({
      filters: [
        { 
          kinds: [1],
          since: now,
        },
        {
          kinds: [1],
          until: now,
          limit: 1000,
        }
      ],

      onEvent: (e) => {
        console.log(`received event: ${e.received.event}`);
      },

      // EOSE(NIP-15)のハンドリングをサポートします。
      // リレーへの接続状態に関わらず、ただ1度だけ呼び出されることが保障されます。
      onEose: () => {
        console.log('EOSE!');
      },

      // イベント取得中に addRelay により追加されたリレーやエラーから復旧したリレーは
      // 自動でイベント取得を再開します。
      // onRecovered ハンドラにより再開時のフィルターを設定することができます。
      onRecovered: () => {
        return {
          kinds: [1],
          since: Math.floor(Date.now() / 1000),
        };
      },
    });
  });
```

## リファレンス

### `Relay` class

`Relay`は単一リレーへの接続を管理します。  
これを用いてリレーとの通信を行うことは可能ですが、基本的には`Mux`と組み合わせて使うことを推奨します。

**コンストラクタ**

```
constructor(url: string, options: RelayOptions)
```

コンストラクタではリレーのURL及びオプションを設定します。  
オプションは以下の通りです。

| オプション | 概要 | デフォルト値 |
|------------|------|-------------|
| connectTimeout | リレー接続時のタイムアウトをミリ秒で指定します | 2000 |
| watchDogInterval | 接続状態の監視等の実行間隔をミリ秒で指定します | 60000 |
| keepAliveTimeout | リレーとの通信が無い場合に、何ミリ秒で要再接続と見なすかを指定します | 60000|

---

**`connect`メソッド**

```
connect(): void
```

リレーへ接続します。

---

**`terminate`メソッド**

```
terminate(): void
```

リレーとの接続を完全に切断します。

---

### `Mux` class

`Mux`は複数の`Relay`によりリレーへの接続を多重化します。

**コンストラクタ**

```
constructor()
```

---

**`allRelays`プロパティ**

```
allRelays: Relay[]
```

`Mux`が管理している全ての`Relay`を返します。

---

**`healthyRelays`プロパティ**

```
healthyRelays: Relay[]
```

`Mux`が管理している全ての`Relay`のうち、リレーと接続状態にあるもののみを返します。

---

**`addRelay`メソッド**

```
addRelay(relay: Relay): void
```

`Mux`に`Relay`を追加します。この際、`Relay`の`connect`メソッドを自動で呼び出します。

---

**`removeRelay`メソッド**

```
addRelay(relay: Relay): void
```

`Mux`から`Relay`を削除します。この際、`Relay`の`terminate`メソッドを自動で呼び出します。

---

**`waitRelayBecomesHealthy`メソッド**

```
waitRelayBecomesHealthy(n: number, timeout: number): Promise<boolean>
```

`Mux`が管理するリレーのうち、リレーと接続できた`Relay`の数が`n`以上になるか、`timeout`ミリ秒経過した時点で履行される`Promise`を返します。  
前者の条件で履行された場合は履行値として`true`、後者の場合は`false`が与えられます。

---

**`subscribe`メソッド**

```
subscribe(options: SubscriptionOptions): string
```

イベントの取得を開始します。戻り値はSubscriptionのIDです。  
指定可能なオプションは以下の通りです。

| オプション | 概要 | デフォルト値
|------------|------|-------------|
| filters | フィルタを指定します | |
| onEvent | イベント受信時のハンドラを指定します | |
| id | イベント取得時に生成されるSubscriptionの`id`を指定します | 自動生成 |
| eoseTimeout | EOSEを受信するまでのタイムアウトをミリ秒で指定します | 5000 |
| onEose | EOSE受信時のハンドラを指定します | undefined |
| onRecovered | イベント取得中に新たな`Relay`からイベント取得が可能になった場合に、そこで適用されるフィルタを返すハンドラを指定します | 後述 |

`onRecovered`を指定しない場合、以下の手順に従って生成されたフィルタを使用しリレーからのイベント取得再開を試みます。

 1. 元々のフィルタをコピーする
 2. コピーされたフィルタに`until`が存在しており、かつ、これがフィルタコピー時点より過去の場合、イベント取得を再開しない
 3. コピーされたフィルタに`since`が存在しており、かつ、これがフィルタコピー時点より未来の場合、このフィルタをそのまま使いイベント取得を再開する
 4. コピーされたフィルタに`since`が存在しており、かつ、これがフィルタコピー時点より過去の場合、または`since`が存在していない場合、コピーされたフィルタに現在時刻を値とした`since`を設定し、イベント取得を再開する

 ---

**`unSubscribe`メソッド**

```
unSubscribe(subID: string): void
```

SubscriptionのIDを指定し、イベントの取得を停止します。