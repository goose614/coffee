// ***** actual stuff
require("dotenv").config()
const express = require("express");
// const bodyParser = require("body-parser") // apparently we don't need body parser anymore!
const ejs = require("ejs");
const mongoose = require("mongoose");
const passport = require('passport');  
const GoogleStrategy = require('passport-google-oauth20').Strategy;  
const session = require('express-session');
const _ = require("lodash")
const MongoStore = require('connect-mongo');

// ***** my stuff
const pastMeets = require("./cjlh_materials/past_meets.js")
const about = require("./cjlh_materials/about.js")
const sponsors = require("./cjlh_materials/sponsors.js")







// ****** setting up mongo

mongoose.connect(process.env.MONGO || "mongodb://localhost:27017/coffeeDB", {useNewUrlParser: true, useUnifiedTopology: true });

const postSchema = new mongoose.Schema({
    title: String,
    body: String,
    url: String,
    date: Date,
    published: Boolean,
    img: String
});

const userSchema = new mongoose.Schema({
    id: String
})

const Post = mongoose.model("post", postSchema);
const User = mongoose.model("user", userSchema);

// ***** setting up the app

const app = express()

app.set("view-engine", "ejs")
app.use(express.urlencoded({extended: true}));
app.use(express.static("public"))

const root = "https://"





// ************ setting up Google OAuth2.0

// setting up cookies

app.use(session({  
    secret: process.env.SESSION_SECRET || 'default_session_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO || "mongodb://localhost:27017/coffeeDB"
    })
}));

app.use(passport.initialize());  
app.use(passport.session());

passport.serializeUser((user, done) => {  
    done(null, user);
});
  
passport.deserializeUser((userDataFromCookie, done) => {  
    done(null, userDataFromCookie);
});

// setting up google auth

passport.use(new GoogleStrategy (  
    {
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: (process.env.CALLBACK || 'http://localhost:3000') + '/auth/google/callback',
        scope: ['email', 'profile'],
    },
    (accessToken, refreshToken, profile, cb) => {
        // console.log('Our user authenticated with Google, and Google sent us back this profile info identifying the authenticated user:', profile);
        // can put anything into req.user, we choose to send just the raw profile (i.e. email)

        console.log(profile)
        return cb(null, {id: profile.id, name: profile.name, displayName: profile.displayName, emails: profile.emails});
    },
));

app.get('/auth/google/callback',  
    passport.authenticate('google', { failureRedirect: '/', session: true }),
    (req, res) => {
        console.log('wooo we authenticated, here is our user object:', req.user);
        // res.json(req.user); // idk why they had this
        res.redirect('/');
    }
);

app.get("/login", (req, res) => {
    if(!req.isAuthenticated()) {
        res.redirect("/auth/google/callback");
    } else {
        res.redirect("/")
    }
})

app.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/");
})








// **** BLOG stuffs

// ************************* THEIR SIDE

const htmlify = (str) => {
    return ("<p>" + str.replace(/\r\n/g, " </p> <p> ") + "</p>");
}

const homeStr = (str) => {
    // str = htmlify(str)
    str = str.split("<img")[0].slice(0, 100) + (str.length > 100 ? "..." : "")

    return str
}

const homeFind = (request, cb) => {
    Post.find(request, {}, {limit: 5, sort: {date: -1}}, (err, posts) => {
        cb(posts)
    })
}

const blogFind = (request, cb) => {
    const years = []

    Post.find(request, {_id: 0, body: 0}, {sort: {date: -1}}, (err, posts) => {
        if(posts) {
            for(post of posts) {
                year = post.date.getYear() + 1900

                if(years.length === 0 || years[years.length - 1].year != year) {
                    years[years.length] = {year: year, months: []}
                    currentYear = year
                }

                // if(!years[year]) {
                //     years[year] = {};
                // }

                console.log(years);

                months = years[years.length - 1].months
                month = post.date.toLocaleString('default', { month: 'long' })


                if(months.length === 0 || months[months.length - 1].month != month) {
                    months[months.length] = {month: month, posts: []}
                }

                months[months.length - 1].posts = [...months[months.length - 1].posts, post]
            }

            cb(years);
        } else {
            console.log(err)
        }
    })
}

app.get("/", (req, res) => {
    let request = {published: true}
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                request = {}
                posts = homeFind(request, (posts) => {
                    posts.map(post => {
                        post.body = homeStr(post.body)
                        return post
                    })
                    res.render("blog/home.ejs", {posts: posts, admin: true, name: (req.user.name.givenName ? req.user.name.givenName : req.user.displayName)});
                })
            } else {
                posts = homeFind(request, (posts) => {
                    posts.map(post => {
                        post.body = homeStr(post.body)
                        return post
                    })
                    res.render("blog/home.ejs", {posts: posts, admin: false, name: (req.user.name.givenName ? req.user.name.givenName : req.user.displayName)});
                })
            }
        })
    } else {
        posts = homeFind(request, (posts) => {
            posts.map(post => {
                post.body = homeStr(post.body)
                return post
            })
            res.render("blog/home.ejs", {posts: posts, admin: false, name: false});
        })
    }
    
})

app.get("/posts/:post", (req, res) => {
    Post.findOne({url: req.params.post}, (err, post) => {
        if(err || !post) res.redirect("/"); // 404
        else {
            // post.body = "<p> " + JSON.stringify(post.body).slice(1, -1) + " </p>"
            post.body = htmlify(post.body)
            if(req.isAuthenticated()) {
                User.findOne({id: req.user.id}, (err, user) => {
                    if(user) {
                        res.render("blog/post.ejs", {post: post, admin: true})
                    } else res.render("blog/post.ejs", {post: post, admin: false});
                })
            } else {
                res.render("blog/post.ejs", {post: post, admin: false});
            }
        }
    })
})

app.get("/blog", (req, res) => {
    let request = {published: true}
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                request = {}
                blogFind(request, (years) => {
                    res.render("blog/blog.ejs", {years: years, admin: true});
                })
            } else {
                blogFind(request, (years) => {
                    res.render("blog/blog.ejs", {years: years, admin: false});
                })
            }
        })
    } else {
        blogFind(request, (years) => {
            res.render("blog/blog.ejs", {years: years, admin: false});
        })
    }
})






// ********************* MY SIDE

// DO NOT input titles that are a previous title + "-[integer number]"
const getUrl = (title, change=false, cb) => {
    let url = title.toLowerCase().replace(/\s/g, "-")
    let newUrl = url;
    Post.find({title: title}, {url: 1}, {sort: {url: 1}}, (err, posts) => {
        if(posts) {
            let count = 0;

            newUrl = url + (posts.length > 0 ? "-" + (posts.length + 1) : "")

            for(post of posts) {
                console.log(url + (count > 0 ? "-" + count : ""), post.url)
                if(post.url === change) {
                    newUrl = change;

                }
                if((url + (count > 0 ? "-" + count : "")) != post.url) {
                    newUrl = url + (count > 0 ? "-" + count : "");
                    break;
                }
                count++;
            }
        }
        cb(newUrl);
    })
}

const updateAndRedirect = (url, request, redirect, res) => {
    Post.updateOne({url: url}, request, (err, post) => {
        if(!err) {
            if(redirect) {
                res.redirect("/");
            } else {
                res.redirect("/compose/" + url)
            }
        }
        else console.log(err);
    });
}

app.route("/compose").get((req, res) => {
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                html = "[Compiled code will appear here.]"
                res.render("blog/compose.ejs", {post: {}});
            } else res.redirect("/");
        })
    } else {
        res.redirect("/");
    }
}).post((req, res) => {
    console.log(req.body);
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                req.body.title = req.body.title.replace(/\?/g, "").replace(/\:/g, "")
                getUrl(req.body.title, null, (url) => {
                    let now = Date.now();

                    let published = false;

                    if(req.body.publish) {
                        published = true
                    } else if(req.body.unpublished) {
                        published = false
                    }

                    const post = new Post({
                        title: req.body.title,
                        body: req.body.message,
                        url: url,
                        date: now,
                        published: published,
                        img: req.body.img
                    })

                    post.save(err => {
                        if(!err) {
                            if(req.body.publish) {
                                res.redirect("/");
                            } else if(req.body.save) {
                                res.redirect("/compose/" + url)
                            } else if(req.body.unpublish) {
                                res.redirect("/")
                            }
                        }
                    })
                })
            } else res.redirect("/"); // 404
        })
    } else {
        res.redirect("/"); // 404
    }
})

app.route("/compose/:post").get((req, res) => {
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                Post.findOne({url: req.params.post}, (err, post) => {
                    html = htmlify(post.body)
                    if(html === "") html = "[Compiled code will appear here.]"
                    if(!err) {
                        res.render("blog/compose.ejs", {post: post, html: html})
                    } else {
                        res.redirect("/"); // 404
                    }
                });
            } else res.redirect("/"); // 404
        })
    } else {
        res.redirect("/"); // 404
    }
}).post((req, res) => {
    if(req.isAuthenticated()) {
        User.findOne({id: req.user.id}, (err, user) => {
            if(user) {
                let request = {}
                let redirect = false

                if(req.body.publish) {
                    request.published = true
                    redirect = true
                } else if(req.body.unpublish) {
                    request.published = false
                    redirect = true
                }

                if(req.body.title) {
                    req.body.title = req.body.title.replace(/\?/g, "").replace(/\:/g, "")
                    request.title = req.body.title
                    request.body = req.body.message
                    request.img = req.body.img

                    getUrl(req.body.title, req.params.post, (url) => {
                        request.url = url
                        console.log(request)

                        updateAndRedirect(req.params.post, request, redirect, res)
                    })
                } else {
                    updateAndRedirect(req.params.post, request, redirect, res)
                }

            } else res.redirect("/"); // 404
        })
    } else {
        res.redirect("/"); // 404
    }
})











// ******* CJLH stuffs

// THINGS TO CHANGE EACH MEET
/*

* nav bar (title only)
* const currentmeet
* add agenda file with same name as currentmeet
* add past meet to past_meets.js

*/

const cjlhroot = "/cjlh/"

const currentMeet = "phiday"

// lots of static pages to be served up

app.get(cjlhroot, (req, res) => {
    res.render("cjlh/index.ejs", {url: root + req.headers.host + cjlhroot});
})

app.get(cjlhroot + "meet", (req, res) => {
    res.render("cjlh/meet.ejs", {pastMeets: pastMeets, url: root + req.headers.host + cjlhroot});
})

app.get(cjlhroot + "past-meets", (req, res) => {
    res.render("cjlh/past-meets.ejs", {pastMeets: pastMeets, url: root + req.headers.host + cjlhroot})
})

app.get(cjlhroot + "about", (req, res) => {
    res.render("cjlh/about.ejs", {about: about, sponsors: sponsors, url: root + req.headers.host + cjlhroot})
})

app.get(cjlhroot + "agenda", (req, res) => {
    res.redirect(cjlhroot + "agendas/" + currentMeet);
})

app.get(cjlhroot + "agendas/:meet", (req, res) => {
    console.log('hii')
    res.render("cjlh/agendas/" + req.params.meet + ".ejs", {url: root + req.headers.host + cjlhroot}, (err, result) => {
        if(err) {
            res.render("cjlh/404.ejs")
            console.log(err)
        } else {
            res.send(result)
        }
        console.log(err, result)
    })
})

app.get(cjlhroot + "*", (req, res) => {
    res.render("cjlh/404.ejs")
})

app.listen(process.env.PORT || 3000, (err) => {
    if (!err) console.log("successfully started on port 3000 or process.env.PORT");
    else console.log(err);
})