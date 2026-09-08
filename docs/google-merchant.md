# Feed do Google Merchant Center — shopbox

## URL do feed

```
https://shopboxonline.com/api/public/feed/google.xml
```

Formato: RSS 2.0 com namespace `g:` (`http://base.google.com/ns/1.0`).
Cache: 30 minutos (`Cache-Control: public, max-age=1800`).
Rota: `src/routes/api/public/feed/google[.]xml.ts` (leitura pública, respeita RLS
via chave publicável — nenhum dado de cliente é exposto).

## O que entra no feed

Somente produtos **ativos**, **com estoque > 0**, com **nome**, **imagem** e
**preço > 0**.

| Campo Google        | Origem no cadastro                      |
| ------------------- | --------------------------------------- |
| `g:id`              | `sku` quando existe, senão o id interno |
| `g:title`           | `name` (até 150 caracteres)             |
| `g:description`     | `description` (ou o nome, se vazia)     |
| `g:link`            | `/produto/{id}`                         |
| `g:image_link`      | primeira imagem do produto              |
| `g:availability`    | `in_stock` (só entram itens com estoque)|
| `g:condition`       | `new`                                   |
| `g:price`           | `price` em BRL                          |
| `g:brand`           | `brand` — **apenas se cadastrada**      |
| `g:product_type`    | `category`                              |
| `g:identifier_exists` | `no` quando não há marca              |

## O que NÃO é enviado (e por quê)

- **GTIN / MPN**: não existem no cadastro. Não são inventados — o Merchant
  aceita `identifier_exists: no` nesse caso.
- **Marca**: enviada só quando preenchida no produto. Produtos sem marca ficam
  sem `g:brand` (isso pode limitar alguns formatos de anúncio; a correção é
  cadastrar a marca real no produto, não preencher no feed).
- **Frete e prazo**: configurados no próprio Merchant Center, já que o frete é
  cotado em tempo real pela transportadora por endereço.

## Passos manuais para conectar (não automatizados)

1. Acesse o Google Merchant Center e crie/entre na conta da loja.
2. Verifique e reivindique o domínio `shopboxonline.com`.
3. Em **Produtos → Feeds**, adicione um feed do tipo "Busca programada".
4. Informe a URL acima e a frequência (recomendado: diária).
5. Configure **Frete** e **Impostos** nas configurações da conta.
6. Aguarde o processamento e corrija as reprovações listadas pelo Merchant
   (normalmente descrição curta, imagem pequena ou marca ausente).

## Verificação rápida

```
curl -s https://shopboxonline.com/api/public/feed/google.xml | head -40
```

Deve retornar HTTP 200 e XML válido. O sitemap correspondente está em
`https://shopboxonline.com/sitemap.xml`.
