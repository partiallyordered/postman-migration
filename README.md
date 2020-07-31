
Check out the appropriate `test-scripts` directory
```sh
cd test-scripts/postman
git clone https://github.com/msk-/postman-migration
cd postman-migration
npm ci
npm run transform -- --collection=./Golden_Path_Mojaloop.postman_collection.json
npm run testsimple
```
