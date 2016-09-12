var express = require('express');
var request = require('request');
var model = require('../model');
var multer  = require('multer');
var moment=require('moment');
var crypto=require('crypto');
var router = express.Router();
var mime = require('mime');
var payments = require('./payments');
router.use('/payment', payments);
/********************************************************/
/***************FILE UPLOAD CONFIG***********************/
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/')
  },
  filename: function (req, file, cb) {
    crypto.pseudoRandomBytes(16, function (err, raw) {
      cb(null, raw.toString('hex') + '.' + mime.extension(file.mimetype));
    });
  }
});
var upload = multer({ storage: storage });
/**************CONFIG ENDS*******************************/
/********************************************************/
/*Create new order with just locations*/
router.post('/', (req, res) => {
    var body = req.body;
    var response = {};
    if(!body.hasOwnProperty('corporate_rate')){
        body.corporate_rate=0;
    }
    model.sequelize.transaction(function(t) {
        var failure = "";
        var orderId = -1;
        var timestampId = -1;
        return model.order.create({
            userId: body.user_id,
            order_number: body.order_number,
            vehicleCategoryId: body.vehicleCategoryId,
            corporate_rate: body.corporate_rate,
            //mode_of_payment: body.mode_of_payment,
            delivery_location: model.Sequelize.literal("point(" + req.body.delivery_location.lat + "," + req.body.delivery_location.lng + ")"),
            pickup_location: model.Sequelize.literal("point(" + req.body.pickup_location.lat + "," + req.body.pickup_location.lng + ")"),
            /*billing_address: body.billing_address,
            consignment_value: body.consignment_value,
            weight: body.weight,
            insuranceRequired: body.insuranceRequired,
            labourRequired: body.labourRequired,
            shipment_photo_path: body.shipment_photo_path*/
        }, {
            transaction: t
        }).then(data1 => {
            orderId = data1.id;
            response.order = data1;
            return model.timestamp.create({
                booking_timestamp: model.Sequelize.fn('NOW'),
                orderId: data1.id
            }, {
                transaction: t
            }).then(data2 => {
                console.log('\n\n ****************** Order Id: ' + orderId);
                response.timestamp = data2;
                return model.payment_matrix.create({
                    orderId: orderId,
                    /*payment_type: body.payment_type,
                    payment_loading_mode: body.payment_loading_mode,
                    payment_unloading_mode: body.payment_unloading_mode*/
                }, {
                    transaction: t
                }).then(data3 => {
                    response.payment_matrix = data3;
                    return model.trip_daily.create({
                            orderId: orderId
                        }, {
                            transaction: t
                        })
                        .then(data4 => {
                            response.trip_daily = data4;
                        })
                })
            }, error1 => {
                console.log("Order Creation Fails");
            })
        })
    }).then(result => {
        /*model.payment_matrix.create({
          orderId:orderId,
          payment_type: body.payment_type,
          payment_loading_mode: body.payment_loading_mode,
          payment_unloading_mode: body.payment_unloading_mode
        }).then(data=>{
          res.json({
              stat: 'success',
              code: 200,
              order: result
          })
        }, error=>{
          res.json({
              stat: 'error',
              code: 300,
              error: error
          })
        });*/
        res.json({
            stat: 'success',
            code: 200,
            response: response
        })
    }).catch(error => {
        console.log(error);
        res.json({
            stat: 'failure',
            code: 300,
            error: error
        })
    });
});

/*Update order info*/
router.post('/cn_info/:id', (req, res) => {
    var body = req.body;
    var response={};
    //Consignee details
    var cn_name = body.cn_name;
    var cn_mobile_no = body.cn_mobile_no;
    //Payment matrix part
    var payment_type = body.payment_type;
    var loading_amt = body.loading_amt;
    var unloading_amt = body.unloading_amt;
    var payment_loading_mode = body.payment_loading_mode;
    var payment_unloading_mode = body.payment_unloading_mode;
    //Order update part
    var order_id = req.params.id;
    var weight = body.weight;
    var no_of_units = body.no_of_units;
    var con_value = body.con_value;
    var invoice_sum = body.invoice_sum; //no such attribute in schema
    var insuranceRequired = body.insuranceRequired;
    var labourRequired = body.labourRequired;
    var category = body.category;

    var responseObj={};
    var errorObj={
      stat:'failure',
      code:300
    };

    model.sequelize.transaction(function(t) {
        return model.order.update({
            weight: weight,
            no_of_units: no_of_units,
            consignment_value: con_value,
            insuranceRequired: insuranceRequired,
            labourRequired: labourRequired,
            category: category,
            cn_mobile_no: cn_mobile_no,
            cn_name: cn_name
        },{
          where: {
            id: order_id
          },
          returning: true
        },{
          transaction: t
        }).then(order=>{
          responseObj=order;
          if(typeof responseObj == "undefined" || responseObj[0]<=0){
            errorObj={
              stat:'nodata',
              code:302
            }
            throw new Error('No such order');
          }else{
            return model.payment_matrix.update({
              payment_type:payment_type,
              payment_loading: loading_amt,
              payment_unloading: unloading_amt,
              payment_loading_mode: payment_loading_mode,
              payment_unloading_mode:payment_unloading_mode
            },{
              where:{
                orderId:responseObj[1][0].id
              }
            },{
              transaction: t
            })
          }
        })
    }).then(result => {
      var order=responseObj[1][0];
      /* Send sms to consignee mobile number */
      var message="https://control.msg91.com/api/sendhttp.php?";
      message=message+"authkey=93938AKEktTSB56125977&mobiles="+cn_mobile_no+"&message=Your%20consignment%20number%20is "+order.order_number+".%0AThanks%20for%20using%20GoHyo!&sender=PGOHYO&route=4&country=91";
      request(message,function(response){
        /*res.json({
    	    stat:'success',
    		code:200,
    		sms_response: response,
    		data:data
    	});*/
      });
      /* Get driver mobile number */
      
      var driverId=order.driverId;
      
      model.driver.findOne({
          where:{
              id:driverId
          }
      }).then(driver=>{
          var message="https://control.msg91.com/api/sendhttp.php?";
          message=message+"authkey=93938AKEktTSB56125977&mobiles="+driver.driver_mobile+"&message=%23done&sender=PGOHYO&route=4&country=91";
          request(message,function(response){
            /*res.json({
        	    stat:'success',
        		code:200,
        		sms_response: response,
        		data:data
        	});*/
          });
      })
      
      /* Send sms to driver */
      res.json({
        stat:'success',
        code:200
      });
    }).catch(error => {
      errorObj.error=error;
      res.json(errorObj)
    })

});

/*Get order details*/
router.get('/:id', (req, res) => {
    model.order.findOne({
        include: [model.timestamp, model.payment_matrix, model.trip_daily],
        where: {
          id: req.params.id
        }
    }).then(data => {
        res.json({
            stat: 'success',
            order: data
        });
    }, error => {
        res.json({
            stat: 'failure',
            code: 300,
        });
    });
});

/*Get order timeline*/
router.get('/timeline/:id', (req,res)=>{
  model.timestamp.findOne({
    where: {
      orderId:req.params.id
    }
  }).then(data=>{
    if(data==null){
      res.json({
        stat:'nodata',
        code:302
      })
    }else{
      res.json({
        stat:'success',
        code:200,
        timeline:data
      })
    }
  }, error=>{
    res.json({
      stat:'failure',
      code:300,
      error:error
    });
  })
})

/* update consignment_value */
router.put('/consignment_value/:id', (req,res)=>{
    var consignment_value=req.body.consignment_value;
    var id=req.params.id;
    model.order.update({
        consignment_value:consignment_value
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'error',
            code:300,
            error:error
        })
    })
});
router.put('/cn_value/:id', (req,res)=>{
    var consignment_value=req.body.consignment_value;
    var id=req.params.id;
    model.order.update({
        consignment_value:consignment_value
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'error',
            code:300,
            error:error
        })
    })
});
/* Update no_of_units */
router.put('/units/:id', (req,res)=>{
    var no_of_units=req.body.no_of_units;
    var id=req.params.id;
    model.order.update({
        no_of_units:no_of_units
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'error',
            code:300,
            error:error
        })
    })
});

/* Update consignment value + number of units */
router.put('/cn_update/:id', (req,res)=>{
    var no_of_units=req.body.no_of_units;
    var consignment_value=req.body.con_value;
    var id=req.params.id;
    model.order.update({
        no_of_units:no_of_units,
        consignment_value:consignment_value
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'error',
            code:300,
            error:error
        })
    })
});

/*Assign Order to Driver*/

router.post('/assign', (req, res) => {
    var body = req.body;
    model.order.update({
        vehicleId: body.vehicle_id,
        driverId: body.driver_id
    }, {
        where: {
            id: body.order_id
        }
    }).then(data => {
        if (data > 0) {
            model.order.findOne({
                where: {
                    id: body.order_id
                },
                include: [{
                    model: model.driver,
                    include: [{
                        model: model.driver_vehicle_pair,
                        include: [{
                            model: model.vehicle,
                            attributes: ['location', 'availability', 'vehicle_number', 'vehicle_make_name', 'vehicle_category_name']
                        }]
                    }]
                }]
            }).then(data => {
                res.json({
                    stat: 200,
                    data: {
                        delivery_location: data.delivery_location,
                        pickup_location: data.pickup_location,
                        vehicle: data.driver.driver_vehicle_pair.vehicle,
                        driver_vehicle_pair_id: data.driver.driver_vehicle_pair.id,
                        driver_name: data.driver.driver_name,
                        driver_mobile: data.driver.driver_mobile,
                        driver_pic: data.driver.driver_photo_path,
                        orderCreatedAt: data.createdAt
                    }
                })
            }, error => {
                res.json({
                    stat: 'failure',
                    code: 300
                })
            })
        } else {
            res.json({
                stat: 'nodata',
                code: 301
            })
        }
    }, error => {
        res.json({
            stat: 'failure',
            code: 300,
            error: error
        })
    })
});

/*Reject order*/
router.post('/reject', (req, res) => {
    var body = req.body;
    model.rejection.create({
        orderId: body.order_id,
        rejection_remark: body.rejection_remark
            //penalty_id: body.penalty_id
    }).then(data => {
        res.json({
            stat: 'success',
            code: 200,
            rejection_id: data.id
        })
    }, error => {
        res.json({
            stat: 'failure',
            code: 300
        })
    })
});

/*Update timestamp*/
router.post('/updateStatus/:id/:code', (req, res) => {
    var code = req.params.code;
    var id = req.params.id;
    /* Booking Timestamp */
    if (code == 1) {
        model.timestamp.update({
            loading_destinationReached_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where:{
                id:id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Booking Timestamp updated',
                booking_timestamp: data.booking_timestamp
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Trip Active */
    }else if (code == 2) {
        model.timestamp.update({
            trip_active: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Trip Started',
                trip_active: data.trip_active
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Loading Destination Reached */
    }else if (code == 3) {
        model.timestamp.update({
            loading_destinationReached_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Loading Destination Reached',
                loading_destinationReached_ts: data.loading_destinationReached_ts
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });
        /* Loading Complete */
    } else if (code == 4) { //loading complete
        model.timestamp.update({
            loading_complete_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Loading Complete',
                loading_complete_ts: data.loading_complete_ts
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        }); /* Unloading Reached */
    } else if (code == 5) { // unloading destination reached
        model.timestamp.update({
            unloading_destnReached_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Unloading Destination Reached',
                unloading_destnReached_ts: data.unloading_destnReached_ts
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Unloading Complete */
    } else if (code == 6) { //unloading complete
        model.timestamp.update({
            unloading_complete_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Unloading Complete',
                unloading_complete_ts: data.unloading_complete_ts
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Shipment Reached */
    } else if (code == 7) { //shipment complete
        model.timestamp.update({
            shipment_complete_ts: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Shipment Complete',
                shipment_complete_ts: data.shipment_complete_ts
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Payment Started */
    }else if (code == 8) {
        model.timestamp.update({
            payment_loading_timestamp: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Payment Loading Started',
                payment_loading_timestamp: data.payment_loading_timestamp
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/* Payment Complete */
    }else if (code == 9) {
        model.timestamp.update({
            payment_unloading_timestamp: model.Sequelize.fn('NOW'),
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Payment Unloading Finished',
                payment_unloading_timestamp: data.payment_unloading_timestamp
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });/*Trip Complete */
    }else if (code == 10) {
        model.timestamp.update({
            tripComplete: true,
            currentStatus: code
        }, {
            where: {
                id: id
            }
        }).then(data => {
			model.timestamp.findOne({
				where:{
					id:id
				}
			}).then(ts=>{
				model.order.findOne({
					where:{
						orderId:ts.orderId
					}
				}).then(order=>{
					var message="https://control.msg91.com/api/sendhttp.php?";
					message=message+"authkey=93938AKEktTSB56125977&mobiles="+order.cn_mobile_no+"&message=Your%20consignment%20is%20complete.%20Consignment%20Number%20"+order.order_number+".%0AThanks%20for%20using%20GoHyo!&sender=PGOHYO&route=4&country=91";
					request(message,function(response){
					});
				});
			});
            res.json({
                status: 'success',
                code: 300,
                id: id,
                message: 'Trip Complete',
                trip_complete: data.tripComplete
            });
        }, error => {
            res.json({
                status: 'failure',
                code: 302,
                subCode: code
            });
            console.log(error);
        });
    }else{
        res.json({
            stat:'nodata',
            code: 303,
            message:'Valid code are 1-10'
        })
    }
});

/* Get unit count */
router.get('/units/:id', (req, res) => {
    var id = req.params.id;
    model.order.findOne({
        where: {
            id: id
        }
    }).then(data => {
        res.json({
            stat: 'success',
            code: 200,
            units: data.no_of_units
        })
    }, error => {
        res.json({
            stat: 'failure',
            code: 300
        })
    })
});

/* Get Process Timeline */
router.get('/process/:id', (req, res) => {
    model.payment_matrix.findOne({
        include: [{
            model: model.order,
            attributes: ['mode_of_payment'],
            where: {
                id: req.params.id
            }
        }]
    }).then(data => {
        res.json({
            stat: 'success',
            code: 200,
            process: data
        })
    }, error => {
        res.json({
            stat: 'failure',
            code: 300,
            error: error
        })
    })
})

/* Update Trip Data */

router.post('/trip/:id', (req, res) => {
    var body = req.body;
    model.trip_daily.update({
        trip_distance: body.trip_distance,
        empty_distance: body.empty_distance
    }, {
        where: {
            id: body.trip_id
        }
    }).then(data => {
        res.json({
            stat: 'success',
            code: 200,
            id: data.id
        })
    }, error => {
        res.json({
            stat: 'failure',
            code: 300,
            error: error
        })
    })
})


/* Update Order Attributes*/
/*Shipment Photo Path */
router.post('/shipment', upload.single('photo_path'), (req, res) => {
        var body = req.body;
        model.order.update({
            shipment_photo_path: req.file.filename
        }, {
            where: {
                id: body.order_id
            }
        }).then(data => {
            if (data > 0) {
                res.json({
                    stat: 'success',
                    code: 200
                });
            } else {
                res.json({
                    stat: 'nodata',
                    code: 302
                })
            }
        }, error => {
            res.json({
                stat: 'failure',
                code: 300,
                error: error
            })
        })
    })
    /*Signature Photo Path*/
router.post('/signature', upload.single('photo_path'), (req, res) => {
    var body = req.body;
    model.order.update({
        digital_signature_path: req.file.filename
    }, {
        where: {
            id: body.order_id
        }
    }).then(data => {
        if (data > 0) {
            res.json({
                stat: 'success',
                code: 200
            });
        } else {
            res.json({
                stat: 'nodata',
                code: 302
            })
        }
    }, error => {
        res.json({
            stat: 'failure',
            code: 300,
            error: error
        })
    })
});
//Update Trip Data
router.post('/trip_data/:id', (req, res) => {
        var body = req.body;
        model.order.update({
            distance_travelled: body.distance_travelled,
            timetaken: body.timetaken
        }, {
            where: {
                id: req.params.id
            }
        }).then(data => {
            if (data > 0) {
                res.json({
                    stat: 'success',
                    code: 200
                });
            } else {
                res.json({
                    stat: 'nodata',
                    code: 302
                })
            }
        }, error => {
            res.json({
                stat: 'failure',
                code: 300,
                error: error
            })
        });
    });
    /*Get if the driver is locked to an order*/
router.post('/check_lock_status', (req, res) => {
    var body = req.body;
    model.order.findOne({
        where: {
            id: body.order_id,
            vehicleId: body.vehicle_id
        }
    }).then(data => {
        if (data != null) {
            res.json({
                stat: 'success',
                message: 'tagged',
                code: 200,
                vehicle_id: body.vehicle_id,
                order_id: data.orderId
            });
        } else {
            res.json({
                stat: 'nodata',
                message: 'nottagged',
                code: 302,
                vehicle_id: body.vehicle_id
            });
        }
    }, error => {
        res.json({
            stat: 'failure',
            error: error,
            code: 302
        });
    });
});

/*Lock Vehicle*/
router.post('/lock/:vehicle_id', (req,res)=>{
    //res.json({stat:'Locked for test'});
    var order_id=req.body.order_id;
	model.driver_vehicle_pair.findOne({
        include: [model.driver,
			{
				model: model.vehicle,
				where:{
					id: req.params.vehicle_id
				}
			}, {
            model: model.user,
            attributes: {
                exclude: ['password']
            },
            include: [model.user_category]
        }]
    }).then(data=>{
		if(data!=null){
		    var message="https://control.msg91.com/api/sendhttp.php?";
		    message=message+"authkey=93938AKEktTSB56125977&mobiles="+data.driver.driver_mobile+"&message=_%23"+order_id+"_%23&sender=PGOHYO&route=4&country=91";
		    request(message,function(response){
    			res.json({
    				stat:'success',
    				code:200,
    				sms_response: response,
    				data:data
    			});
		    });
		}else{
			res.json({
				stat:'nodata',
				code: 302
			});
		}
	}, error=>{
		res.json({
			stat:'failure',
			code:300,
			error:error
		});
	});
})
/*Calculate Bill*/
router.post('/calculateBill/:id', (req,res)=>{
  var err=function(error){
    res.json({
      stat:'failure',
      code:300,
      error:error
    })
  };
  var order_id=req.params.id;
  model.order.findOne({
    where:{
      id:order_id
    },
    include:[{
      model: model.vehicle,
      attributes:['vehicleCategoryId'],
      include:[{
        model:model.vehicle_category
      }, {
        model: model.zone,
        attributes:['loading_time','unloading_time','rate_per_minute']
      }]
    },{
      model: model.timestamp
    }],
    attributes:['vehicleId', 'driverId', 'distance_travelled','timetaken']
  }).then(data=>{

    if(data==null){
      res.json({
        stat:'nodata',
        code:302
      })
    }else{
      /* Loading Time Calculation */
      var loadingReached=moment(data.timestamp.loading_destinationReached_ts);
      var loadingComplete=moment(data.timestamp.loading_complete_ts);

      var duration1=moment.duration(loadingComplete.diff(loadingReached));

      var time_for_loading=parseInt(Math.ceil(duration1.asSeconds()));
      console.log(time_for_loading);

      /*Unloading time calculation*/

      var unloadingReached=moment(data.timestamp.unloading_destnReached_ts);
      var unloadingComplete=moment(data.timestamp.unloading_complete_ts);

      var duration2=moment.duration(unloadingComplete.diff(unloadingReached));

      var time_for_unloading=parseInt(Math.ceil(duration2.asSeconds()));
      console.log(time_for_unloading);

      var rate=data.vehicle.vehicle_category.category_rate;
      var rate_per_min=data.vehicle.zone.rate_per_minute;
      var free_loading_time=data.vehicle.zone.loading_time;
      var total_loading_time= time_for_loading;
      var free_unloading_time=data.vehicle.zone.unloading_time;
      var total_unloading_time= time_for_unloading;
      var distance_travelled=data.distance_travelled;
      var timetaken= data.timetaken;

      var distance_bill=(distance_travelled/1000)*rate;
      var penalty_time_loading=Math.ceil(Math.max(0,(total_loading_time-free_loading_time))/60);
      var penalty_time_unloading=Math.ceil(Math.max(0,(total_unloading_time-free_unloading_time))/60);
      var time_bill=(penalty_time_unloading+penalty_time_loading)*rate_per_min;
      var tax=14.54*30*(distance_bill+time_bill)/10000;
      var total_bill=distance_bill+time_bill+tax;

      res.json({
        stat:'success',
        code:200,
        /*vehicleId:data.vehicleId,
        driverId:data.driverId,*/
        distance_travelled: data.distance_travelled,
        timetaken: data.timetaken,
        rate_per_km:data.vehicle.vehicle_category.category_rate,
        free_loading_time:data.vehicle.zone.loading_time,
        total_loading_time: time_for_loading,
        free_unloading_time:data.vehicle.zone.unloading_time,
        total_unloading_time: time_for_unloading,
        rate_per_minute:data.vehicle.zone.rate_per_minute,
        loading_min:penalty_time_loading,
        unloading_min:penalty_time_unloading,
        tax:tax,
        total_bill:Math.ceil(total_bill)
      })
    }
  },err);
});
/* Calculate partial bill */
router.post('/calculateAdvanceBill', (req,res)=>{
  var body=req.body;
  var distance=body.total_km;
  var category_id=body.category_id;
  model.vehicle_category.findOne({
    where:{
      id:category_id
    }
  }).then(data=>{
    if(data!=null){
      var rate_per_km=data.category_rate;
      var distanceBill=Math.ceil((rate_per_km*distance)*0.7);
      var tax=Math.ceil(0.145*0.3)*distanceBill;
      var bill=distanceBill+tax;
      res.json({
        stat:'success',
        code:200,
        rate:rate_per_km,
        bill:bill
      })
    }else{
      res.json({
        stat:'nodata',
        code:302
      })
    }
  }, error=>{
    res.json({
      stat:'failure',
      code:300,
      error:error
    })
  })
});
/*Order Status Management*/
router.put('/order_status/:path/:id', (req,res)=>{
    var id=req.params.id;
    var path=req.params.path;
    var code=100;
    if(path=='driver_denied'){
        code=374837;
    }else if(path=='service_denied'){
        code=7378423;
    }else if(path=='closed'){
        code=25673;
    }
    model.order.update({
        orderStatusId: code
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error: error
        })
    })
});
/*Get driver denied*/
router.get('/by_status/driver_denied', (req,res)=>{
    model.order.findAll({
        where:{
            orderStatusId:374837
        },
        include:[model.payment_matrix, model.timestamp]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get closed orders*/
router.get('/by_status/closed', (req,res)=>{
    model.order.findAll({
        where:{
            orderStatusId:25673
        },
        include:[model.payment_matrix, model.timestamp]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get service denied*/
router.get('/by_status/service_denied', (req,res)=>{
    model.order.findAll({
        where:{
            orderStatusId:7378423
        },
        include:[model.payment_matrix, model.timestamp]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get Complete Orders*/
router.get('/by_status/complete', (req,res)=>{
    model.order.findAll({
        include: [{
            model: model.timestamp,
            where: {
                currentStatus: 10
            }
        }, model.payment_matrix]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get Payment Pending Orders*/
router.get('/by_status/payment_pending', (req,res)=>{
    model.order.findAll({
        include: [{
            model: model.timestamp,
            where: {
                currentStatus: 8
            }
        }, model.payment_matrix]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get Inomplete Orders*/
router.get('/by_status/ongoing', (req,res)=>{
    model.order.findAll({
         include: [{
            model: model.timestamp,
            where: {
                currentStatus: {
                    $ne: 10
                }
            }
        }, model.payment_matrix]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Cancel Order*/
router.post('/cancel/:id', (req,res)=>{
    var id=req.params.id;
    var body=req.body;
    body.orderId=id;
    body.remarks=body.remark;
    model.cancellation.create(body).then(data=>{
        res.json({
            stat:'success',
            code:200,
            cancellation_id:data.id
        })
    }, error=>{
        res.json({
            stat:'failure',
            code: 300,
            error:error,
            error_type: error.errors[0].type
        })
    })
});
/* Get cancelled orders */
router.get('/by_status/cancelled', (req,res)=>{
    model.order.findAll({
        where:{
            orderStatusId:226235
        },
        include:[model.payment_matrix, model.timestamp]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
    })
});
/*Get cancelled orders v2 */
router.get('/cancelled/all', (req,res)=>{
    model.cancellation.findAll({
        include:[model.order]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
        console.log(error);
    })
});
/*Close Order*/
router.post('/close/:id', (req,res)=>{
    model.order.update({
        orderStatusId: 25673
    },{
        where:{
            id:id
        }
    }).then(data=>{
        if(data==0){
            res.json({
                stat:'nodata',
                code:302
            })
        }else{
            res.json({
                stat:'success',
                code:200
            })
        }
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error: error
        })
    })
});
/*Get closed orders*/
router.get('/closed/all', (req,res)=>{
    model.cancellation.findAll({
        where:{
            orderStatusId:25673
        },
        include:[model.order]
    }).then(data=>{
        res.json({
            stat:'success',
            code:200,
            order_count: data.length,
            orders:data
        })
    }, error=>{
        res.json({
            stat:'failure',
            code:300,
            error:error
        })
        console.log(error);
    })
});
module.exports = router;
