
1. Check out the appropriate `test-scripts` directory.
2. Edit `migrate.js`, variable `pmCollectionFile` to point to the PM collection you'd like to transform.
3. Edit `migrate.js`, variable `envPath` to point to the PM environment file to use as input
```sh
npm ci
# produce the transformed jest tests
npm run transform
# run the jest tests
npm run testsimple
```
