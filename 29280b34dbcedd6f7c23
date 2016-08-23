{
	"id": "3f30e4b9-2e7c-8805-18e2-5bc4650b6644",
	"name": "Go Hyo (Sumanta)",
	"description": "",
	"order": [
		"014393ce-cb57-dd54-1c28-46a001f2e794"
	],
	"folders": [],
	"timestamp": 1471709730049,
	"owner": "665249",
	"public": false,
	"published": false,
	"requests": [
		{
			"id": "014393ce-cb57-dd54-1c28-46a001f2e794",
			"headers": "username: hello\ncb: devniouerhf3wiofn32oinof3\nContent-Type: application/json\n",
			"url": "54.173.130.254:3000/orders",
			"pathVariables": {},
			"preRequestScript": "",
			"method": "POST",
			"collectionId": "3f30e4b9-2e7c-8805-18e2-5bc4650b6644",
			"data": [],
			"dataMode": "raw",
			"name": "Create Order",
			"description": "Create New Order",
			"descriptionFormat": "html",
			"time": 1471709730089,
			"version": 2,
			"responses": [],
			"tests": "tests[\"response code is 401\"] = responseCode.code === 401;\ntests[\"response has WWW-Authenticate header\"] = (postman.getResponseHeader('WWW-Authenticate'));\n\nvar authenticateHeader = postman.getResponseHeader('WWW-Authenticate'),\n    realmStart = authenticateHeader.indexOf('\"',authenticateHeader.indexOf(\"realm\")) + 1 ,\n    realmEnd = authenticateHeader.indexOf('\"',realmStart),\n    realm = authenticateHeader.slice(realmStart,realmEnd),\n    nonceStart = authenticateHeader.indexOf('\"',authenticateHeader.indexOf(\"nonce\")) + 1,\n    nonceEnd = authenticateHeader.indexOf('\"',nonceStart),\n    nonce = authenticateHeader.slice(nonceStart,nonceEnd);\n    \npostman.setGlobalVariable('echo_digest_realm', realm);\npostman.setGlobalVariable('echo_digest_nonce', nonce);",
			"currentHelper": "normal",
			"helperAttributes": {},
			"rawModeData": "{\n \"user_id\":\"1\",\n\"order_number\":\"\",\n \"vehicleCategoryId\":\"2\", \n \"delivery_location\":{\n\"lat\":\"11.22\",\n\"lng\":\"33.44\"\n},\n\"pickup_location\":{\n\"lat\":\"11.22\",\n\"lng\":\"33.44\"\n}\n}"
		}
	]
}
