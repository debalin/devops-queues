# DevOps Queues

This repository holds the third homework for the DevOps course. It builds up on the code that Dr. Parnin had provided [here](https://github.com/CSC-DevOps/Queues). The homework specification can be found [here](https://github.com/CSC-DevOps/Course/blob/master/HW/HW3.md). I will first introduce the goal in brief and then describe the different use cases in the following sections, ending with a screencast showing the capabilities of this program.

### Goal 

The goal here is to get comfortable with using [`redis`](http://redis.io/topics/data-types-intro), a server based key-value store. Consequently, this includes spawning Node.js servers on different ports and maintaining them through `redis` lists. Finally, this homework allows us to create proxies for all the requests to our application with the help of the servers we spawned in the previous step. 

### Steps to run my program

1. Clone my repository.
2. Install `Node.js` if you don't already have it. 
3. Run `npm install` on the root directory. 
4. Run `node main.js` to start off the main server (link will be shown in console).
5. Open a browser and go to the link shown (with speecific requests) to do all the functionalities listed as the requirement of the homework. It is important that you follow the link shown in the console as simply going to `localhost` won't do. This is because I have used `os.hostname()` to get the hostname from the operating system and then fed that to `Express.js`. Thus when it does a DNS lookup for the hostname, it gets the current IP and that's where it starts the server, not the loopback address (which `localhost` resolves to).    

### Scenarios

`client` here is the `redis` client obtained by `require('redis').createClient`. 

1. **`/set/key`**: This portion was completed in the workshop. Basically, I form a route in `main.js` to catch the `/set/:key` pattern. The key is automatically extracted by `Express.js` and a `redis` variable with the key name set as the key provided is created (using `client.set`) with the value "This message will self-destruct in 10 seconds.". Then `client.expire` is called on that `redis` key and the timer is set to `10`. 

2. **`/get/key`**: Here, I have formed another route matching `/get/:key`. The key is extracted and `client.get` is used to get the value for that specific key. The obtained value is returned to the user as an HTTP response. I have formatted the response to have some more information that just the value.

3. **`/upload`**: Use `curl` to upload an image to the server. This image will be processed and the data will be stored in a `redis` list using `client.lpush`. I use the following `curl` command to achieve this. The `-L` flag at the end is to make it follow redirects, which will be important later on. Be sure to provide your own IP and a proper image name.  
	```
	curl -F "image=@./img/image_name.jpg" http://IP:3000/upload -L
	``` 
   
4. **`/meow`**: This call from a browser gets the most recent image data stored in the `redis` list using `client.lpop` and feeds it back as a response to the browser in an `<img>` tag. If there are no images, then it will give an appropriate error message.

5. **`/recent`**: Whenever any request is made, an all-catcher pattern using `app.use` registers the specific URL requested in another `redis` list by `client.lpush` and consequently `client.ltrim` to keep its size to `5`. Then, when `/recent` is visited from the browser, this recently visited URL list is fetched using `client.lrange` and shown to the user.

6. **`/spawn`**: The program keeps a track of the current maximum port number used. This starts from `3000` as that is where the main HTTP server had been initially started. In my program, the main server acts almost the same as any other later-spawned proxy server, with only a few differences: 
	1. You cannot destroy the server running at the `3000` port. 
	2. This server is not stored in the spawned servers `redis` list. 
	3. If no proxy servers exist, this server will handle all the requests by itself.

	Coming back to the `spawn` functionality, whenever this is requested, I increment the current maximum port and start a new `Express.js` server at that port. The server URL is then pushed to a `redis` list using `client.rpush`. The response to the browser contains the new server URL that has been formed.

7. **`/listservers`**: Later on, for the proxy part of this assignment, I have used a separate `redis` list to store my currently busy servers. So to list all the servers, I do a `client.lrange` call for both the lists and show them to the user appropriately. 

8. **`/destroy`**: For this part of the assignment, I first take the length of my free servers `redis` list using `client.llen`. Then I randomly choose an interger between `0` and `length - 1`, where `length` is the return value of the `client.llen` call. This random index is the one which I will remove from the `redis` list. I first get the value from that index using `client.lindex` and then remove that value from the list using `client.lrem`. A `/listservers` call after that should show that the server is not there. Ideally, removing a server should also mean that the server is completely destroyed, i.e. it cannot be accessed anymore through the browser, but as per Professor's suggestions (in Slack), for the assignment, I have only removed the server from the `redis` list and nothing more. 

9. **Proxies**: I have implemented this in two ways - using the `request` Node.js module and using redirection. When any request comes in to my program, I do the following things: 
	1. I have an initial all-catcher pattern which sees if this current server URL is present in my busy servers `redis` list. If so, then this particular server process (or port) must have been previously added to this list by another server process to delegate this particular request. So I move on to handle this request. Before that, I also remove myself from the busy servers list and add to the free servers list, so that I can be available for later requests. 
	2. If this server is not present in the list, then this is the initial entry point of the request from the browser and I can proxy this request to any other available server. I do that by simply doing a `client.rpoplpush` which takes the last server in the free servers `redis` list and puts it in the top of the busy servers `redis` list. Now two things can follow:
		1. There was nothing in the free servers `redis` list to do a `rpoplpush`. In that case, the current server, which was trying to proxy the request, handles the request itself. 
		2. If the `rpoplpush` returned a non-null value, then it was able to push something to the busy servers `redis` list. Now, this current server just needs to forward the request to the server URL that it just pushed to the busy servers `redis` list. Then two different cases can ensue:
			1. The request was a `GET` request. This is simple - just use the `request` module to make a `GET` request to the specified server and once it returns, send the response back to the user. In this case, the user won't be able to see the proxy server URL in the browser address bar and hence won't be able to determine which server process actually handled its request. 
			2. For `POST` requests (like `/upload`), I used redirection. I could use either for both of these cases, but using both allowed me to learn the pros and cons of them. Redirecting `POST` requests is a little tricky, because just a normal `res.redirect(url)` will not make the request `POST` but will rather convert it to a default `GET` request, thus losing the `POST` parameters. This is a norm for HTTP requests (read [here](http://softwareengineering.stackexchange.com/questions/99894/why-doesnt-http-have-post-redirect)). To maintain the form data and the request method, the redirect has to be done with the status code of `307`. This is what I have done - `res.redirect(307, url)`. Also, to use `curl` properly with this redirection, you have to add the `-L` flag which tells `curl` to follow redirects.                 


### Screencast

https://www.youtube.com/watch?v=aZ9JBP2wp14&feature=youtu.be

